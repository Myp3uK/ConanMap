import { computeDecay, computeDecayByObject } from '../../src/services/snapshot'

// Build a 16-byte DecayTimestamp blob with float32 LE decay_at at offset 12.
function tsBlob (decayAt) {
  const b = Buffer.alloc(16)
  b.writeFloatLE(decayAt, 12)
  return b
}

// Build a fake better-sqlite3 db whose prepare(sql) routes to canned rows
// based on which query is being run.
function fakeDb ({ runtime, guilds = [], buildings = [], decayTimestamps = [], decayDisabled = [] }) {
  return {
    prepare (sql) {
      if (sql.includes('serverruntime')) {
        return { get: () => (runtime == null ? undefined : { v: runtime }) }
      }
      if (sql.includes('FROM guilds')) {
        return { all: () => guilds }
      }
      if (sql.includes('FROM buildings')) {
        return { all: () => buildings }
      }
      if (sql.includes('DecayTimestamp')) {
        return { all: () => decayTimestamps }
      }
      if (sql.includes('DecayDisabled')) {
        return { all: () => decayDisabled }
      }
      throw new Error('unexpected query: ' + sql)
    }
  }
}

describe('computeDecay', () => {
  const RT = 1_000_000 // server runtime in seconds

  test('computes hours = (decay_at - serverruntime) / 3600', () => {
    const db = fakeDb({
      runtime: RT,
      buildings: [{ object_id: 1, owner_id: 'A' }],
      decayTimestamps: [{ object_id: 1, value: tsBlob(RT + 7200) }] // +2h
    })
    expect(computeDecay(db)).toEqual({ A: { hours: 2, protected: false } })
  })

  test('rounds hours to one decimal place', () => {
    const db = fakeDb({
      runtime: RT,
      buildings: [{ object_id: 1, owner_id: 'A' }],
      decayTimestamps: [{ object_id: 1, value: tsBlob(RT + 5400) }] // +1.5h
    })
    expect(computeDecay(db).A.hours).toBe(1.5)
  })

  test('takes the most-urgent (minimum) decay per owner', () => {
    const db = fakeDb({
      runtime: RT,
      buildings: [
        { object_id: 1, owner_id: 'A' },
        { object_id: 2, owner_id: 'A' }
      ],
      decayTimestamps: [
        { object_id: 1, value: tsBlob(RT + 36000) }, // +10h
        { object_id: 2, value: tsBlob(RT + 7200) }   // +2h  <- min
      ]
    })
    expect(computeDecay(db).A.hours).toBe(2)
  })

  test('DecayDisabled with last byte 0x01 marks owner protected', () => {
    const db = fakeDb({
      runtime: RT,
      buildings: [{ object_id: 1, owner_id: 'A' }],
      decayTimestamps: [{ object_id: 1, value: tsBlob(RT + 7200) }],
      decayDisabled: [{ object_id: 1, value: Buffer.from([0x00, 0x01]) }]
    })
    expect(computeDecay(db).A).toEqual({ hours: null, protected: true })
  })

  test('blob shorter than 16 bytes => protected', () => {
    const db = fakeDb({
      runtime: RT,
      buildings: [{ object_id: 1, owner_id: 'A' }],
      decayTimestamps: [{ object_id: 1, value: Buffer.alloc(8) }]
    })
    expect(computeDecay(db).A).toEqual({ hours: null, protected: true })
  })

  test('invalid decay_at values (<=0 or >=1e10) => protected', () => {
    const db = fakeDb({
      runtime: RT,
      buildings: [
        { object_id: 1, owner_id: 'A' },
        { object_id: 2, owner_id: 'B' }
      ],
      decayTimestamps: [
        { object_id: 1, value: tsBlob(0) },
        { object_id: 2, value: tsBlob(2e10) }
      ]
    })
    const r = computeDecay(db)
    expect(r.A).toEqual({ hours: null, protected: true })
    expect(r.B).toEqual({ hours: null, protected: true })
  })

  test('owner with no decay info stays protected', () => {
    const db = fakeDb({
      runtime: RT,
      buildings: [{ object_id: 1, owner_id: 'A' }],
      decayTimestamps: []
    })
    expect(computeDecay(db).A).toEqual({ hours: null, protected: true })
  })

  test('missing serverruntime is treated as 0', () => {
    const db = fakeDb({
      runtime: null,
      buildings: [{ object_id: 1, owner_id: 'A' }],
      decayTimestamps: [{ object_id: 1, value: tsBlob(7200) }] // 7200/3600 = 2h from t=0
    })
    expect(computeDecay(db).A.hours).toBe(2)
  })

  test('negative hours are kept (already-decaying structures)', () => {
    const db = fakeDb({
      runtime: RT,
      buildings: [{ object_id: 1, owner_id: 'A' }],
      decayTimestamps: [{ object_id: 1, value: tsBlob(RT - 3600) }] // -1h
    })
    expect(computeDecay(db).A.hours).toBe(-1)
  })

  test('admin guild (name matches pattern) stays protected despite low decay', () => {
    const db = fakeDb({
      runtime: RT,
      guilds: [
        { guildId: 'G_ADMIN', name: 'ADMIN Team' },
        { guildId: 'G_NORM', name: 'Raiders' }
      ],
      buildings: [
        { object_id: 1, owner_id: 'G_ADMIN' },
        { object_id: 2, owner_id: 'G_NORM' }
      ],
      decayTimestamps: [
        { object_id: 1, value: tsBlob(RT + 3600) }, // admin: 1h left, but protected
        { object_id: 2, value: tsBlob(RT + 3600) }  // normal: 1h left, shown
      ]
    })
    const r = computeDecay(db, ['%ADMIN%', '%Админ%'])
    expect(r.G_ADMIN).toEqual({ hours: null, protected: true })
    expect(r.G_NORM).toEqual({ hours: 1, protected: false })
  })

  test('case-insensitive and Cyrillic admin patterns match', () => {
    const db = fakeDb({
      runtime: RT,
      guilds: [{ guildId: 'G1', name: 'Админы сервера' }],
      buildings: [{ object_id: 1, owner_id: 'G1' }],
      decayTimestamps: [{ object_id: 1, value: tsBlob(RT + 3600) }]
    })
    expect(computeDecay(db, ['%Админ%']).G1).toEqual({ hours: null, protected: true })
  })

  test('returns {} and does not throw when a query fails', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {})
    const db = { prepare: () => { throw new Error('db gone') } }
    expect(computeDecay(db)).toEqual({})
    spy.mockRestore()
  })

  test('ignores buildings with owner_id 0 (filtered by SQL)', () => {
    // The SQL already filters owner_id <> 0; the fake returns only valid rows,
    // so an empty owner set yields an empty result.
    const db = fakeDb({ runtime: RT, buildings: [] })
    expect(computeDecay(db)).toEqual({})
  })
})

describe('computeDecayByObject', () => {
  const RT = 1_000_000

  test('maps each non-protected building object to its hours left', () => {
    const db = fakeDb({
      runtime: RT,
      buildings: [
        { object_id: 10, owner_id: 'A' },
        { object_id: 11, owner_id: 'A' }
      ],
      decayTimestamps: [
        { object_id: 10, value: tsBlob(RT + 7200) },  // 2h
        { object_id: 11, value: tsBlob(RT + 36000) }  // 10h
      ]
    })
    expect(computeDecayByObject(db)).toEqual({ 10: 2, 11: 10 })
  })

  test('omits protected, admin and timer-less objects', () => {
    const db = fakeDb({
      runtime: RT,
      guilds: [{ guildId: 'G_ADMIN', name: 'ADMIN' }],
      buildings: [
        { object_id: 1, owner_id: 'G_ADMIN' },          // admin -> omitted
        { object_id: 2, owner_id: 'B' },                // disabled -> omitted
        { object_id: 3, owner_id: 'C' },                // no timer -> omitted
        { object_id: 4, owner_id: 'D' }                 // real timer -> kept
      ],
      decayTimestamps: [
        { object_id: 1, value: tsBlob(RT + 3600) },
        { object_id: 2, value: tsBlob(RT + 3600) },
        { object_id: 4, value: tsBlob(RT + 3600) }
      ],
      decayDisabled: [{ object_id: 2, value: Buffer.from([0x01]) }]
    })
    expect(computeDecayByObject(db, ['%ADMIN%'])).toEqual({ 4: 1 })
  })

  test('returns {} and does not throw when a query fails', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {})
    const db = { prepare: () => { throw new Error('db gone') } }
    expect(computeDecayByObject(db)).toEqual({})
    spy.mockRestore()
  })
})

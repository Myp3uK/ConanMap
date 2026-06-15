import {
  hashPassword, verifyPassword, isHash, passwordIssues,
  signToken, verifyToken
} from '../../src/services/auth'

describe('password hashing', () => {
  test('hash + verify round-trips for the correct password', () => {
    const h = hashPassword('CorrectHorse123X')
    expect(isHash(h)).toBe(true)
    expect(verifyPassword('CorrectHorse123X', h)).toBe(true)
  })

  test('verify fails for a wrong password', () => {
    const h = hashPassword('CorrectHorse123X')
    expect(verifyPassword('wrong', h)).toBe(false)
  })

  test('two hashes of the same password differ (random salt)', () => {
    expect(hashPassword('CorrectHorse123X')).not.toBe(hashPassword('CorrectHorse123X'))
  })

  test('verify rejects malformed stored values', () => {
    expect(verifyPassword('x', 'plaintext')).toBe(false)
    expect(verifyPassword('x', '')).toBe(false)
    expect(verifyPassword('x', null)).toBe(false)
  })

  test('isHash recognises only scrypt hashes', () => {
    expect(isHash('scrypt$ab$cd')).toBe(true)
    expect(isHash('plain')).toBe(false)
    expect(isHash('')).toBe(false)
  })
})

describe('password policy', () => {
  test('a strong password has no issues', () => {
    expect(passwordIssues('AdminPass123456X')).toEqual([])
  })

  test('reports each missing requirement', () => {
    expect(passwordIssues('short')).toEqual(
      expect.arrayContaining(['at least 16 characters', 'an uppercase letter', 'a digit'])
    )
    expect(passwordIssues('alllowercaseletters')).toContain('an uppercase letter')
    expect(passwordIssues('ALLUPPERCASELETTERS')).toContain('a lowercase letter')
    expect(passwordIssues('NoDigitsHereAtAll!')).toContain('a digit')
  })
})

describe('session token', () => {
  test('sign + verify returns the username', () => {
    const t = signToken('admin')
    expect(verifyToken(t)).toBe('admin')
  })

  test('tampered token is rejected', () => {
    const t = signToken('admin')
    expect(verifyToken(t + 'x')).toBeNull()
    expect(verifyToken(t.slice(0, -2))).toBeNull()
  })

  test('garbage input is rejected', () => {
    expect(verifyToken('')).toBeNull()
    expect(verifyToken('a.b.c')).toBeNull()
    expect(verifyToken(null)).toBeNull()
  })
})

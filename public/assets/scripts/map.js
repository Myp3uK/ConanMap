var playersData = []
var playersSort = { key: 'char_name', dir: 'asc' }
var playersSearch = ''
var markerLayers = {}
var groupNames = {}
var groupColors = {}
var map
var mapMinZoom = 2
var mapMaxZoom = 6
var mapMaxNativeZoom = 4   // highest zoom with real tiles; 5–6 are browser-upscaled
var DISABLE_CLUSTER_AT_ZOOM = 4   // at this zoom and closer, markers show individually
var DEFAULT_PANEL = 'clans'       // side panel shown when nothing else is selected
var MARKER_FILL = '#7ea8e0'   // site accent — markers stand out from the map background
var MARKER_STROKE = '#0f1419'
// 1x1 transparent gif: shown instead of the broken-image icon for missing tiles
var TRANSPARENT_TILE = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
var mapConfigs = {
  exiledlands: {
    label: 'Exiled Lands',
    rangeX: [-296000, 412000],
    rangeY: [-292000, 353500],
    tiles: 'assets/tiles/{z}/{x}/{y}.webp',
    xMax: 800000
  },
  siptah: {
    label: 'Isle of Siptah',
    rangeX: [1118122, 1979015],
    rangeY: [-263282, 528457],
    tiles: 'assets/tiles-siptah/{z}/{x}/{y}.webp?v=3',
    xMin: 1000000
  }
}
var activeMap = 'exiledlands'
var tileLayer = null
var mapBounds = null
var boundsX = [ 14.4, 230.7 ]
var boundsY = [ -47.7, -245.3 ]
var activeKinds = {}
var clanFilter = []   // selected clan ids; empty = show all clans
var clanSortMode = 'count'
var clanSortDir = 'desc'        // 'asc' | 'desc' — sort direction for the structures list
var decayByOwner = {}           // ownerId -> { hours, protected } (backend, for protected flag)
var decayByObject = {}          // building object_id -> hoursLeft (non-protected only)
var decayByGroup = {}           // owner group id -> min hoursLeft across that owner's RENDERED markers
var isAdmin = false             // logged-in admin (enables admin-only actions)
var viewMode = 'houses'         // 'houses' (game data) | 'markers' (custom markers)
var customMarkers = []          // custom markers for the active server
var customLayer = null          // Leaflet layer group for custom markers
var iconList = []               // available marker-icon webp filenames
var ctxPoint = null             // last right-clicked map point { x, y }
var selectedIcon = null         // chosen icon in the add-marker modal
var inactiveDays = 0
var clusterEnabled = false
var clusterGroups = {}
var activeServerId = null
var lastActiveTimestamp = null   // last snapshot time drawn for the active server
var allMarkersData = []
var markerByCoords = {}
var playerLastOnline = {}
var guildLastOnline = {}
var guildRosters = {}           // guild_id -> [{ name, level, online, lastSeen }]
var circleMarkerOptions = {
  color: MARKER_STROKE,
  weight: 1.5,
  fillColor: MARKER_FILL,
  fillOpacity: 0.95,
  radius: 6
}

var tooltipOptions = {
  direction: 'top'
}

var colorhash = new ColorHash({
  // Muted palette so the red/yellow decay-warning outline stands out clearly.
  lightness: [ 0.45, 0.52, 0.6 ],
  saturation: [ 0.35, 0.45, 0.55 ]
})

function escapeHtml(str) {
  if (str === null || str === undefined) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// DB stores UTC strings ("YYYY-MM-DD HH:MM:SS"); parse to epoch ms.
function parseDbTs (str) {
  if (!str) return null
  var t = new Date(String(str).replace(' ', 'T') + 'Z').getTime()
  return isNaN(t) ? null : t
}

// Single date format everywhere: dd.MM.yyyy HH:mm (shown as the stored UTC time).
function fmtDateTime (ts) {
  if (!ts) return '—'
  var d = new Date(ts)
  function p (n) { return (n < 10 ? '0' : '') + n }
  return p(d.getUTCDate()) + '.' + p(d.getUTCMonth() + 1) + '.' + d.getUTCFullYear() +
         ' ' + p(d.getUTCHours()) + ':' + p(d.getUTCMinutes())
}

function convertRange( value, r1, r2 ) {
  return (value - r1[0]) * (r2[1] - r2[0]) / (r1[1] - r1[0]) + r2[0]
}

function toLatLng(x, y) {
  var cfg = mapConfigs[activeMap]
  return [ convertRange(y, cfg.rangeY, boundsY), convertRange(x, cfg.rangeX, boundsX) ]
}

function fromLatLng(lat, lng) {
  var cfg = mapConfigs[activeMap]
  return {
    x: Math.round(convertRange(lng, boundsX, cfg.rangeX)),
    y: Math.round(convertRange(lat, boundsY, cfg.rangeY))
  }
}

function loadServers () {
  $.getJSON('api/servers', function (servers) {
    if (!servers || !servers.length) {
      toastr.error('Нет доступных серверов. Проверьте конфигурацию.')
      return
    }
    renderServersList(servers)
    if (servers.length === 1) {
      selectServer(servers[0].id)
    } else {
      openPanel('servers')
    }
  }).fail(function () {
    toastr.error('Не удалось загрузить список серверов.')
  })
}

// Periodically refresh the server list ("last updated" times) and, if the
// active server's snapshot changed (auto_refresh on the backend), redraw data.
function pollServers () {
  $.getJSON('api/servers', function (servers) {
    renderServersList(servers)
    if (!activeServerId) return
    var active = null
    servers.forEach(function (s) { if (s.id === activeServerId) active = s })
    if (active && active.timestamp && active.timestamp !== lastActiveTimestamp) {
      getPlayers()
      getDecay()
      renderActiveView()
    }
    getCustomMarkers()   // live pickup of markers added by other admins
  })
}

function renderServersList (servers) {
  var html = ''
  servers.forEach(function (s) {
    var ago = s.timestamp ? timeSince(new Date(s.timestamp)) : 'never'
    var active = s.id === activeServerId ? ' server-active' : ''
    var sid = JSON.stringify(s.id).replace(/"/g, '&quot;')
    html += '<div class="server-item' + active + '" onclick="selectServer(' + sid + ')">'
    html += '<span class="server-radio">' + (s.id === activeServerId ? '◉' : '○') + '</span>'
    html += '<div class="server-info">'
    html += '<span class="server-name">' + escapeHtml(s.name) + '</span>'
    html += '<span class="server-ago">' + ago + '</span>'
    html += '</div>'
    html += '</div>'
  })
  $('#servers-list').html(html)
}

function timeSince (date) {
  var seconds = Math.floor((new Date() - date) / 1000)
  if (seconds < 60) return 'just now'
  var minutes = Math.floor(seconds / 60)
  if (minutes < 60) return minutes + ' min. ago'
  var hours = Math.floor(minutes / 60)
  if (hours < 24) return hours + ' h. ago'
  return Math.floor(hours / 24) + ' d. ago'
}

function selectServer (serverId) {
  activeServerId = serverId
  getPlayers()
  getDecay()
  getCustomMarkers()
  if (viewMode === 'markers') {
    renderCustomMarkers()
    openPanel('markers')
    return
  }
  showAll()
  openPanel(DEFAULT_PANEL)   // show the default panel right after data loads
}

function init() {
  map = L.map('map', {
    maxZoom: mapMaxZoom,
    minZoom: mapMinZoom,
    crs: L.CRS.Simple,
    attributionControl: false,
    zoomControl: false
  })

  mapBounds = new L.LatLngBounds(
    map.unproject([0, 16128], mapMaxZoom),
    map.unproject([16128, 0], mapMaxZoom)
  )

  map.setView(mapBounds.getCenter(), 2)

  tileLayer = L.tileLayer(mapConfigs[activeMap].tiles, {
    minZoom: mapMinZoom,
    maxZoom: mapMaxZoom,
    minNativeZoom: mapMinZoom,
    maxNativeZoom: mapMaxNativeZoom,
    bounds: mapBounds,
    errorTileUrl: TRANSPARENT_TILE,
    tms: false,
    updateWhenIdle: true,
    keepBuffer: 0,
    updateWhenZooming: false
  }).addTo(map)

  // Sidebar panel toggles. Structures/players/filters/search are the "houses"
  // view; "markers" switches the map to custom markers.
  var housePanels = ['clans', 'players', 'filters', 'search']
  $('.sb-btn[data-panel]').on('click', function () {
    var name = $(this).data('panel')
    if (name === 'markers') {
      setViewMode('markers')
      getCustomMarkers()
      openPanel('markers')
      return
    }
    if (housePanels.indexOf(name) !== -1) setViewMode('houses')
    if (name === 'players') {
      showPlayerList()
    } else if (name === 'search') {
      openPanel('search')
      setTimeout(function () { $('#search-input').focus() }, 50)
    } else {
      openPanel(name)
    }
  })

  $(document).on('click', '.panel-close', function () {
    closePanel()
  })

  // ── Admin login ──
  checkAuth()
  $('#login-btn').on('click', function () {
    if (isAdmin) {
      doLogout()
    } else {
      $('#login-error').text('')
      $('#login-modal').css('display', 'flex')
      setTimeout(function () { $('#login-user').focus() }, 50)
    }
  })
  $('#login-cancel, #login-close').on('click', closeLoginModal)
  $('#login-submit').on('click', doLogin)
  $('#login-pass').on('keydown', function (e) { if (e.key === 'Enter') doLogin() })
  // Modals close only via Esc or the ✕/Cancel buttons (never on outside click).
  $(document).on('keydown', function (e) { if (e.key === 'Escape') closeAllModals() })

  // ── Add-marker modal + markers panel ──
  $('#marker-cancel, #marker-close').on('click', closeMarkerModal)
  $('#marker-save').on('click', saveMarker)
  $(document).on('click', '#marker-icons .icon-opt', function () {
    selectedIcon = $(this).data('icon')
    $('#marker-icons .icon-opt').removeClass('selected')
    $(this).addClass('selected')
  })
  $(document).on('click', '.marker-item', function (e) {
    if ($(e.target).closest('.marker-del').length) return
    navigateToResult($(this).data('x'), $(this).data('y'))
  })
  $(document).on('click', '.marker-del', function (e) {
    e.stopPropagation()
    deleteMarker($(this).data('id'))
  })

  map.on('click', function () {
    closePanel()
  })

  $('#inactive-days').on('input', function () {
    inactiveDays = parseInt($(this).val(), 10) || 0
    redrawAll()
  })

  $('#cluster-toggle').on('change', function () {
    clusterEnabled = $(this).is(':checked')
    redrawAll()
  })

  // Filter item clicks
  $(document).on('click', '.filter-item', function () {
    var kind = $(this).attr('id').replace(/-filter$/, '')
    toggleFilter(kind)
  })

  // Map switch buttons
  $(document).on('click', '.map-btn', function () {
    switchMap($(this).data('map'))
  })

  // Keep dropdown open when interacting with search inside it
  $('#clan-filter-menu').on('click', function (e) {
    e.stopPropagation()
  })
  $('#clan-filter-search').on('click', function (e) {
    e.stopPropagation()
  })
  $('#clan-filter-search').on('input', function () {
    rebuildClanFilterMenu()
  })

  $(document).on('click', '.clan-sort-btn', function () {
    var mode = $(this).data('sort')
    if (clanSortMode === mode) {
      clanSortDir = clanSortDir === 'asc' ? 'desc' : 'asc'   // re-click toggles direction
    } else {
      clanSortMode = mode
      clanSortDir = mode === 'count' ? 'desc' : 'asc'        // count: most first; name/decay: asc
    }
    rebuildClanFilterMenu()
  })

  $('#players-search').on('input', function () {
    playersSearch = $(this).val()
    renderPlayerTable()
  })

  $(document).on('click', '.players-list-table-head .sortable', function () {
    var key = $(this).data('sort-key')
    if (playersSort.key === key) {
      playersSort.dir = playersSort.dir === 'asc' ? 'desc' : 'asc'
    } else {
      playersSort.key = key
      playersSort.dir = 'asc'
    }
    renderPlayerTable()
  })

  $(document).on('input', '#search-input', function () {
    performSearch($(this).val())
  })

  $(document).on('keydown', '#search-input', function (e) {
    if (e.key === 'Enter') {
      var first = $('#search-results .search-result').first()
      if (first.length) first.trigger('click')
    }
  })

  map.on('mousemove', function (e) {
    if ($('#coord-debug').is(':visible')) {
      var c = fromLatLng(e.latlng.lat, e.latlng.lng)
      $('#coord-text').text('TeleportPlayer ' + c.x + ' ' + c.y + ' 0')
    }
  })

  // Right-click on empty map → context menu for that point.
  map.on('contextmenu', function (e) {
    if (e.originalEvent) e.originalEvent.preventDefault()
    var c = fromLatLng(e.latlng.lat, e.latlng.lng)
    showContextMenu(e.originalEvent.clientX, e.originalEvent.clientY,
      'TeleportPlayer ' + c.x + ' ' + c.y, { x: c.x, y: c.y })
  })

  // Dismiss the context menu on any outside interaction.
  map.on('movestart click', hideContextMenu)
  $(document).on('mousedown', function (e) {
    if (!$(e.target).closest('#map-ctx-menu').length) hideContextMenu()
  })
  $(document).on('keydown', function (e) { if (e.key === 'Escape') hideContextMenu() })

  window.addEventListener('keydown', function (e) {
    if (e.ctrlKey && (e.code === 'KeyF' || e.key === 'f' || e.key === 'F')) {
      e.preventDefault()
      openPanel('search')
      setTimeout(function () { $('#search-input').focus() }, 50)
    }
    if (e.key === 'Escape') {
      closePanel()
    }
    if (e.shiftKey && e.code === 'KeyC') {
      $('#coord-debug').toggle()
    }
  }, true)

  loadServers()
  setInterval(pollServers, 60000)   // keep "last updated" and data fresh in the UI
}

function switchMap(name) {
  if (name === activeMap) return
  activeMap = name

  if (tileLayer) map.removeLayer(tileLayer)
  tileLayer = L.tileLayer(mapConfigs[name].tiles, {
    minZoom: mapMinZoom,
    maxZoom: mapMaxZoom,
    minNativeZoom: mapMinZoom,
    maxNativeZoom: mapMaxNativeZoom,
    bounds: mapBounds,
    errorTileUrl: TRANSPARENT_TILE,
    tms: false,
    updateWhenIdle: true,
    keepBuffer: 0,
    updateWhenZooming: false
  }).addTo(map)

  map.setView(mapBounds.getCenter(), 2)
  renderActiveView()

  $('.map-btn').removeClass('active')
  $('.map-btn').filter(function () { return $(this).data('map') === name }).addClass('active')
}

function makeBadge (cls, text) {
  return '<span class="badge ' + cls + '">' + escapeHtml(text) + '</span>'
}

function tipRow (label, value) {
  var val = (value === null || value === undefined || value === '' || value === 'Unknown')
    ? '<span class="tip-val-dim">—</span>'
    : '<span class="tip-val">' + escapeHtml(String(value)) + '</span>'
  return '<div class="tip-row"><span class="tip-lbl">' + escapeHtml(label) + '</span>' + val + '</div>'
}

function parseThrallInfo (info) {
  if (!info) return { faction: '', tier: null }
  var m = info.match(/\b(T[1-4])\b/i)
  if (!m) return { faction: info, tier: null }
  return { tier: m[1].toUpperCase(), faction: info.replace(m[0], '').trim() }
}

function tierBadgeClass (tier) {
  return { T1: 'badge-t1', T2: 'badge-t2', T3: 'badge-t3', T4: 'badge-t4' }[tier] || ''
}

function getTooltipContent (marker) {
  var ph = language.phrases
  var header = ''
  var badge = ''
  var rows = ''
  var kind = marker._kind || ''

  if (kind === 'players') {
    header = ph['ui.player'] || 'Player'
    badge = marker.online == 1 ? makeBadge('badge-online', '● Онлайн') : ''
    rows += tipRow(ph['ui.name'] || 'Name', marker.char_name)
    rows += tipRow(ph['ui.guild'] || 'Guild', marker.guild_name)
    rows += tipRow(ph['ui.rank'] || 'Rank', marker.rank)
    rows += tipRow(ph['ui.level'] || 'Level', marker.level)

  } else if (kind === 'thralls') {
    var parsed = parseThrallInfo(marker.info)
    header = ph['ui.thrall'] || 'Thrall'
    badge = parsed.tier ? makeBadge(tierBadgeClass(parsed.tier), parsed.tier) : ''
    rows += tipRow(ph['ui.name'] || 'Name', marker.name)
    rows += tipRow(ph['ui.faction'] || 'Faction', parsed.faction)
    rows += tipRow(ph['ui.owner'] || 'Owner', getOwnerById(marker.owner) || String(marker.owner || '—'))

  } else if (kind === 'pets') {
    header = ph['ui.pet'] || 'Pet'
    badge = marker.greater ? makeBadge('badge-alpha', 'Альфа') : ''
    rows += tipRow(ph['ui.name'] || 'Name', marker.name)
    rows += tipRow(ph['ui.species'] || 'Species', marker.info)
    rows += tipRow(ph['ui.owner'] || 'Owner', getOwnerById(marker.owner) || String(marker.owner || '—'))

  } else {
    // Building (and pippi)
    var translatedKind = marker.kind ? (ph['items.' + marker.kind] || marker.kind) : ''
    header = translatedKind
    if (marker.guild_name) rows += tipRow(ph['ui.guild'] || 'Guild', marker.guild_name)
    else rows += tipRow(ph['ui.player'] || 'Player', marker.char_name)
    var dh = markerDecayHours(marker)
    if (dh !== null) {
      rows += tipRow(ph['ui.decay'] || 'Decay', decayShortLabel(dh))
    }
  }

  var tip = '<div class="tip-header">' + escapeHtml(header)
  if (badge) tip += ' ' + badge
  tip += '</div>'
  tip += rows
  return tip
}

function clearAllLayers () {
  markerByCoords = {}

  Object.keys(markerLayers).forEach(function (k) {
    if (map.hasLayer(markerLayers[k])) map.removeLayer(markerLayers[k])
    markerLayers[k].clearLayers()
  })
  markerLayers = {}

  Object.keys(clusterGroups).forEach(function (k) {
    if (map.hasLayer(clusterGroups[k])) map.removeLayer(clusterGroups[k])
  })
  clusterGroups = {}

  if (customLayer) {
    if (map.hasLayer(customLayer)) map.removeLayer(customLayer)
    customLayer.clearLayers()
  }

  groupNames = {}
  groupColors = {}
}

function isOnActiveMap(x) {
  var cfg = mapConfigs[activeMap]
  if (cfg.xMax !== undefined && x >= cfg.xMax) return false
  if (cfg.xMin !== undefined && x < cfg.xMin) return false
  return true
}

function renderMarkers (markers) {
  clearAllLayers()

  markers.forEach(function (marker) {
    if (!isOnActiveMap(marker.x)) return
    if (!isOwnerInactive(marker)) return

    var group = 'default'
    marker.stroke = 'black'

    if (marker.guild_name) {
      group = marker.guild_id
      marker.color = colorhash.hex(marker.guild_id + marker.guild_name)
      groupNames[group] = marker.guild_name
      groupColors[group] = marker.color
    } else if (marker.char_name) {
      group = marker.char_id
      marker.color = colorhash.hex(marker.char_id + marker.char_name)
      groupNames[group] = marker.char_name
      groupColors[group] = marker.color
    } else if (marker.owner) {
      var owner = getOwnerById(marker.owner)
      group = marker.owner
      marker.guild_name = owner
      marker.color = colorhash.hex(marker.owner + owner) || 'pink'
      groupNames[group] = owner || String(marker.owner)
      groupColors[group] = marker.color
    } else if (marker.info) {
      marker.color = 'yellow'
    }

    if (marker.online == 1) {
      marker.stroke = 'white'
    }

    // Highlight buildings that are about to decay (colored, thicker outline).
    var warn = decayWarnStyle(markerDecayHours(marker))
    if (warn) {
      marker.stroke = warn.color
      marker._decayWeight = warn.weight
      marker._decayWarn = warn.level
    }

    marker.tooltip = getTooltipContent(marker)

    if (!clusterGroups[group]) {
      var cgColor = marker.color || MARKER_FILL
      var cgOpts = {
        iconCreateFunction: makeClusterIcon(cgColor),
        maxClusterRadius: 80,
        spiderfyOnMaxZoom: true,
        showCoverageOnHover: false,
        chunkedLoading: true
      }
      // Default: cluster when zoomed out, split into individual markers when
      // zoomed in. The "cluster at all zooms" setting keeps them grouped always.
      if (!clusterEnabled) cgOpts.disableClusteringAtZoom = DISABLE_CLUSTER_AT_ZOOM
      var cg = L.markerClusterGroup(cgOpts)
      cg.on('clustermouseover', function (e) {
        e.layer.unbindTooltip()
        e.layer.bindTooltip(clusterTooltipHtml(e.layer), { direction: 'top', sticky: true, opacity: 0.95 }).openTooltip()
      })
      cg.on('clustermouseout', function (e) {
        e.layer.closeTooltip()
        e.layer.unbindTooltip()
      })
      clusterGroups[group] = cg
    }
    createMarkerInCluster(marker, clusterGroups[group])
  })

  Object.keys(clusterGroups).forEach(function (k) {
    clusterGroups[k].addTo(map)
  })

  computeGroupDecay()
  applyClanFilter()
  rebuildClanFilterMenu()
}

function drawData () {
  if (!activeServerId) return
  var kinds = Object.keys(activeKinds)
  if (kinds.length === 0) {
    clearAllLayers()
    rebuildClanFilterMenu()
    return
  }
  allMarkersData = []
  var remaining = kinds.length
  var allMarkers = []
  var lastUpdate = null

  kinds.forEach(function (kind) {
    var url = kind.replace(/_/g, '/')
    $.getJSON('api/' + activeServerId + '/' + url, function (data) {
      if (data.update) lastUpdate = data.update
      if (data.data) {
        data.data.forEach(function (item) { item._kind = kind })
        allMarkersData = allMarkersData.concat(data.data)
        allMarkers = allMarkers.concat(data.data)
      }
      remaining--
      if (remaining === 0) {
        if (lastUpdate) $('.lastupdate').html(lastUpdate)
        lastActiveTimestamp = lastUpdate
        renderMarkers(allMarkers)
        updateFilterCounts()
      }
    }).fail(function () {
      remaining--
      if (remaining === 0) renderMarkers(allMarkers)
    })
  })
}

function updateFilterCounts () {
  var counts = {}
  allMarkersData.forEach(function (item) {
    if (!isOnActiveMap(item.x)) return
    var k = item._kind
    counts[k] = (counts[k] || 0) + 1
  })
  $('.filter-item').each(function () {
    var id = $(this).attr('id')
    if (!id) return
    var kind = id.replace(/-filter$/, '')
    var n = counts[kind]
    $(this).find('.filter-count').text(n !== undefined ? n : '')
  })
}

function getOwnerById (ownerId) {
  var id = String(ownerId)
  var owner
  playersData.find(function (player) {
    if (String(player.char_id) === id) {
      owner = player.char_name
      return true
    }
    if (String(player.guild_id) === id) {
      owner = player.guild_name
      return true
    }
  })
  return owner || false
}

function toggleFilter (kind) {
  kind = kind.replace('/', '_')
  // Remove 'all' shorthand when switching to specific filters
  if (activeKinds['all']) {
    delete activeKinds['all']
  }
  if (activeKinds[kind]) {
    delete activeKinds[kind]
    $('#' + kind + '-filter').removeClass('active')
  } else {
    activeKinds[kind] = true
    $('#' + kind + '-filter').addClass('active')
  }
  // Auto-fallback to View all when all checkboxes unchecked
  if (Object.keys(activeKinds).length === 0) {
    activeKinds = { 'all': true }
    $('.filter-item').removeClass('active')
  }
  drawData()
}

function showAll () {
  activeKinds = { 'all': true }
  $('.filter-item').removeClass('active')
  drawData()
}

function resetFilters () {
  activeKinds = { 'all': true }
  clanFilter = []
  inactiveDays = 0
  clusterEnabled = false
  $('.filter-item').removeClass('active')
  $('#inactive-days').val('')
  $('#cluster-toggle').prop('checked', false)
  $('#clan-filter-search').val('')
  drawData()
}

// ── Admin auth (cookie session) ──────────────────────────────────────────────
function updateAdminUI () {
  $('body').toggleClass('is-admin', isAdmin)
  $('#login-btn').attr('title',
    isAdmin ? (language.phrases['ui.logout'] || 'Log out') : (language.phrases['ui.login'] || 'Log in'))
  $('#login-btn .login-icon-out').toggle(!isAdmin)
  $('#login-btn .login-icon-in').toggle(isAdmin)
}

function checkAuth () {
  $.getJSON('api/me', function (d) {
    isAdmin = !!(d && d.admin)
    updateAdminUI()
  })
}

function closeLoginModal () {
  $('#login-modal').css('display', 'none')
  $('#login-user').val('')
  $('#login-pass').val('')
  $('#login-error').text('')
}

// Close every open modal (Esc handler). Modals never close on outside click.
function closeAllModals () {
  closeLoginModal()
  if (typeof closeMarkerModal === 'function') closeMarkerModal()
}

function doLogin () {
  var username = $('#login-user').val()
  var password = $('#login-pass').val()
  $.ajax({
    url: 'api/login', method: 'POST', contentType: 'application/json',
    data: JSON.stringify({ username: username, password: password })
  }).done(function (d) {
    isAdmin = !!(d && d.admin)
    updateAdminUI()
    renderMarkersPanel()
    closeLoginModal()
    toastr.success(language.phrases['ui.logged_in'] || 'Logged in')
  }).fail(function () {
    $('#login-error').text(language.phrases['ui.login_failed'] || 'Invalid username or password')
  })
}

function doLogout () {
  $.ajax({ url: 'api/logout', method: 'POST' }).always(function () {
    isAdmin = false
    updateAdminUI()
    renderMarkersPanel()
    toastr.info(language.phrases['ui.logged_out'] || 'Logged out')
  })
}

// ── View mode: houses (game data) vs custom markers ──────────────────────────
function setViewMode (mode) {
  if (mode === viewMode) return
  viewMode = mode
  renderActiveView()
}

function renderActiveView () {
  if (viewMode === 'markers') renderCustomMarkers()
  else drawData()
}

// ── Custom markers ───────────────────────────────────────────────────────────
function getCustomMarkers () {
  if (!activeServerId) return
  $.getJSON('api/' + activeServerId + '/custom-markers', function (d) {
    customMarkers = (d && d.data) || []
    if (viewMode === 'markers') renderCustomMarkers()
    renderMarkersPanel()
  })
}

function customIcon (icon) {
  return L.icon({
    iconUrl: 'assets/markers/' + encodeURIComponent(icon),
    iconSize: [32, 32], iconAnchor: [16, 16], tooltipAnchor: [0, -14]
  })
}

function renderCustomMarkers () {
  clearAllLayers()
  if (!customLayer) customLayer = L.layerGroup()
  customLayer.clearLayers()
  customMarkers.forEach(function (m) {
    if (m.map !== activeMap) return
    var mk = L.marker(toLatLng(m.x, m.y), { icon: customIcon(m.icon) })
    if (m.label) mk.bindTooltip(escapeHtml(m.label), { direction: 'top' })
    mk.on('contextmenu', function (e) {
      L.DomEvent.stopPropagation(e)
      if (e.originalEvent) e.originalEvent.preventDefault()
      showContextMenu(e.originalEvent.clientX, e.originalEvent.clientY,
        'TeleportPlayer ' + m.x + ' ' + m.y, { x: m.x, y: m.y })
    })
    customLayer.addLayer(mk)
  })
  customLayer.addTo(map)
  renderMarkersPanel()
}

function renderMarkersPanel () {
  var ph = language.phrases
  $('#markers-hint').text(isAdmin ? (ph['ui.markers_hint_admin'] || '') : (ph['ui.markers_hint_view'] || ''))
  var list = customMarkers.filter(function (m) { return m.map === activeMap })
  if (!list.length) {
    $('#markers-list').html('<div class="search-empty">' + escapeHtml(ph['ui.no_markers'] || 'No markers') + '</div>')
    return
  }
  var html = ''
  list.forEach(function (m) {
    html += '<div class="marker-item" data-x="' + m.x + '" data-y="' + m.y + '">'
    html += '<img class="marker-item-icon" src="assets/markers/' + encodeURIComponent(m.icon) + '">'
    html += '<span class="marker-item-label">' + escapeHtml(m.label || '—') + '</span>'
    if (isAdmin) html += '<button class="marker-del" data-id="' + escapeHtml(m.id) + '" title="' + escapeHtml(ph['ui.delete'] || 'Delete') + '">✕</button>'
    html += '</div>'
  })
  $('#markers-list').html(html)
}

function deleteMarker (id) {
  $.ajax({ url: 'api/' + activeServerId + '/custom-markers/' + encodeURIComponent(id), method: 'DELETE' })
    .done(function () {
      toastr.info(language.phrases['ui.marker_deleted'] || 'Deleted')
      getCustomMarkers()
    })
    .fail(function () { toastr.error('Error') })
}

// ── Add-marker modal (admin) ─────────────────────────────────────────────────
function openAddMarker () {
  if (!isAdmin || !ctxPoint) return
  selectedIcon = null
  $('#marker-label').val('')
  loadIconPicker()
  $('#marker-modal').css('display', 'flex')
  setTimeout(function () { $('#marker-label').focus() }, 50)
}

function closeMarkerModal () {
  $('#marker-modal').css('display', 'none')
}

function loadIconPicker () {
  var render = function () {
    var html = ''
    iconList.forEach(function (ic) {
      html += '<button class="icon-opt" data-icon="' + escapeHtml(ic) + '"><img src="assets/markers/' + encodeURIComponent(ic) + '"></button>'
    })
    $('#marker-icons').html(html)
  }
  if (iconList.length) render()
  else $.getJSON('api/marker-icons', function (d) { iconList = (d && d.icons) || []; render() })
}

function saveMarker () {
  if (!ctxPoint) return
  if (!selectedIcon) { toastr.warning(language.phrases['ui.pick_icon'] || 'Pick an icon'); return }
  $.ajax({
    url: 'api/' + activeServerId + '/custom-markers', method: 'POST', contentType: 'application/json',
    data: JSON.stringify({ map: activeMap, x: ctxPoint.x, y: ctxPoint.y, icon: selectedIcon, label: $('#marker-label').val() })
  }).done(function () {
    closeMarkerModal()
    toastr.success(language.phrases['ui.marker_added'] || 'Marker added')
    setViewMode('markers')
    getCustomMarkers()
    openPanel('markers')
  }).fail(function () { toastr.error('Error') })
}

function copyText (str) {
  var input = document.createElement('textarea')
  document.body.appendChild(input)
  input.value = str
  input.select()
  document.execCommand('copy')
  input.remove()
}

function onClick (point) {
  copyText(point.target.options.teleport)
  toastr.success(language.phrases['ui.teleport_copied'])
}

function onMarkerContext (e) {
  L.DomEvent.stopPropagation(e)
  if (e.originalEvent) e.originalEvent.preventDefault()
  var o = e.target.options
  showContextMenu(e.originalEvent.clientX, e.originalEvent.clientY, o.coordsCmd,
    (o.gameX != null ? { x: o.gameX, y: o.gameY } : null))
}

// ── Right-click context menu (Add marker [disabled] · Copy coordinates) ───────
function ctxMenuEl () {
  var el = document.getElementById('map-ctx-menu')
  if (!el) {
    el = document.createElement('div')
    el.id = 'map-ctx-menu'
    el.className = 'ctx-menu'
    document.body.appendChild(el)
  }
  return el
}

function hideContextMenu () {
  var el = document.getElementById('map-ctx-menu')
  if (el) el.style.display = 'none'
}

// teleportCmd: "TeleportPlayer x y z" for the clicked point or marker.
// point: { x, y } game coords used by "Add marker" (admin only).
function showContextMenu (clientX, clientY, teleportCmd, point) {
  var ph = language.phrases
  ctxPoint = point || null
  var el = ctxMenuEl()
  var addCls = isAdmin ? 'ctx-item' : 'ctx-item ctx-disabled'
  el.innerHTML =
    '<div class="' + addCls + '" data-act="add">' + escapeHtml(ph['ui.add_marker'] || 'Add marker') + '</div>' +
    '<div class="ctx-item" data-act="copy">' + escapeHtml(ph['ui.copy_coords'] || 'Copy coordinates') + '</div>'
  if (isAdmin) {
    el.querySelector('[data-act="add"]').onclick = function () {
      hideContextMenu()
      openAddMarker()
    }
  }
  el.querySelector('[data-act="copy"]').onclick = function () {
    copyText(teleportCmd)
    toastr.success(ph['ui.coords_copied'] || ph['ui.teleport_copied'])
    hideContextMenu()
  }
  el.style.display = 'block'
  var w = el.offsetWidth, h = el.offsetHeight
  var left = clientX, top = clientY
  if (left + w > window.innerWidth - 8) left = window.innerWidth - w - 8
  if (top + h > window.innerHeight - 8) top = window.innerHeight - h - 8
  el.style.left = left + 'px'
  el.style.top = top + 'px'
}

function createMarker(marker, group) {
  var opt = Object.assign({}, circleMarkerOptions)
  opt.fillColor = marker.color || opt.fillColor
  opt.color = marker.stroke || opt.color
  if (marker._decayWeight) opt.weight = marker._decayWeight
  opt.teleport = 'TeleportPlayer ' + marker.x + ' ' + marker.y + ' ' + marker.z
  opt.coordsCmd = 'TeleportPlayer ' + marker.x + ' ' + marker.y
  opt.gameX = marker.x; opt.gameY = marker.y

  if (group && !markerLayers[group]) markerLayers[group] = L.layerGroup()

  var point = L.circleMarker(toLatLng(marker.x, marker.y), opt)
    .bindTooltip(marker.tooltip, tooltipOptions)
    .on('click', onClick)
    .on('contextmenu', onMarkerContext)

  markerByCoords[marker.x + ',' + marker.y] = point

  if (group) {
    point.addTo(markerLayers[group])
    return
  }
  point.addTo(map)
}

function resetPanels () {
  $('.overlay-panel').removeClass('open')
  $('.sb-btn:not(.map-btn)').removeClass('active')
  $('#search-input').val('')
  $('#search-results').empty()
}

function openPanel (name) {
  var $btn = $('.sb-btn[data-panel="' + name + '"]')
  // re-clicking an already open (non-default) panel falls back to the default one
  if ($btn.hasClass('active') && name !== DEFAULT_PANEL) {
    name = DEFAULT_PANEL
    $btn = $('.sb-btn[data-panel="' + name + '"]')
  }
  resetPanels()
  $('#panel-' + name).addClass('open')
  $btn.addClass('active')
}

// The side panel is always visible — "closing" returns to the default panel.
function closePanel () {
  resetPanels()
  $('#panel-' + DEFAULT_PANEL).addClass('open')
  $('.sb-btn[data-panel="' + DEFAULT_PANEL + '"]').addClass('active')
}

function showPlayerList () {
  if (!activeServerId) return
  $.getJSON('api/' + activeServerId + '/players', function (data) {
    playersData = data.data
    playersSearch = ''
    $('#players-search').val('')
    renderPlayerTable()
    openPanel('players')
  })
}

function renderPlayerTable () {
  var q = playersSearch.toLowerCase()
  var filtered = playersData.filter(function (p) {
    if (!q) return true
    return (p.char_name || '').toLowerCase().indexOf(q) !== -1 ||
           (p.guild_name || '').toLowerCase().indexOf(q) !== -1
  })

  filtered.sort(function (a, b) {
    var va = a[playersSort.key]
    var vb = b[playersSort.key]
    if (playersSort.key === 'level' || playersSort.key === 'rank') {
      va = parseInt(va) || 0
      vb = parseInt(vb) || 0
      if (va < vb) return playersSort.dir === 'asc' ? -1 : 1
      if (va > vb) return playersSort.dir === 'asc' ? 1 : -1
      return 0
    }
    va = String(va || '').toLowerCase()
    vb = String(vb || '').toLowerCase()
    if (va < vb) return playersSort.dir === 'asc' ? -1 : 1
    if (va > vb) return playersSort.dir === 'asc' ? 1 : -1
    return 0
  })

  $('.players-list-table-head .sortable').each(function () {
    $(this).removeClass('sort-asc sort-desc')
    if ($(this).data('sort-key') === playersSort.key) {
      $(this).addClass(playersSort.dir === 'asc' ? 'sort-asc' : 'sort-desc')
    }
  })

  var ph = language.phrases
  var html = ''
  filtered.forEach(function (player) {
    // Rank + level shown via the native title tooltip (never clipped by the panel/overlay).
    var tipParts = []
    if (player.rank) tipParts.push((ph['ui.rank'] || 'Rank') + ': ' + player.rank)
    if (player.level) tipParts.push((ph['ui.level'] || 'Level') + ': ' + player.level)
    var titleAttr = tipParts.length ? ' title="' + escapeHtml(tipParts.join(' · ')) + '"' : ''
    html += '<tr class="player-list-item' + (player.online == 1 ? ' player-online-row' : '') + '"' + titleAttr + '>'
    html += '<td>' + escapeHtml(player.char_name) + '</td>'
    html += '<td>' + escapeHtml(player.guild_name) + '</td>'
    html += '<td>' + escapeHtml(fmtDateTime(parseDbTs(player.last_online))) + '</td>'
    html += '</tr>'
  })
  $('.players-list-table').html(html)
}

function redrawAll () {
  drawData()
}

function isOwnerInactive (marker) {
  if (!inactiveDays || inactiveDays <= 0) return true
  var lastSeen
  if (marker.guild_id) {
    lastSeen = guildLastOnline[String(marker.guild_id)]
  } else if (marker.char_id) {
    lastSeen = playerLastOnline[String(marker.char_id)]
  } else if (marker.owner) {
    var ownerId = String(marker.owner)
    lastSeen = playerLastOnline[ownerId] || guildLastOnline[ownerId]
  }
  if (lastSeen == null) return true
  var thresholdMs = Date.now() - inactiveDays * 86400000
  return lastSeen <= thresholdMs
}

function createMarkerInCluster (marker, clusterGroup) {
  var opt = Object.assign({}, circleMarkerOptions)
  opt.fillColor = marker.color || opt.fillColor
  opt.color = marker.stroke || opt.color
  if (marker._decayWeight) opt.weight = marker._decayWeight
  opt.decayWarn = marker._decayWarn || null
  opt.teleport = 'TeleportPlayer ' + marker.x + ' ' + marker.y + ' ' + marker.z
  opt.coordsCmd = 'TeleportPlayer ' + marker.x + ' ' + marker.y
  opt.gameX = marker.x; opt.gameY = marker.y
  opt.markerGuildId = marker.guild_id || null
  opt.markerGuildName = marker.guild_name || ''
  opt.markerCharId = marker.char_id || null
  opt.markerCharName = marker.char_name || ''

  var point = L.circleMarker(toLatLng(marker.x, marker.y), opt)
    .bindTooltip(marker.tooltip, tooltipOptions)
    .on('click', onClick)
    .on('contextmenu', onMarkerContext)
    .addTo(clusterGroup)

  markerByCoords[marker.x + ',' + marker.y] = point
}

function makeClusterIcon (color) {
  return function (cluster) {
    var size = 40
    // Propagate the worst decay warning of any child marker to the cluster bubble,
    // so decaying blocks are visible without zooming in.
    var warn = null
    var kids = cluster.getAllChildMarkers()
    for (var i = 0; i < kids.length; i++) {
      var w = kids[i].options.decayWarn
      if (w === 'red') { warn = 'red'; break }
      if (w === 'yellow') warn = 'yellow'
    }
    var warnCls = warn ? ' cluster-warn-' + warn : ''
    return L.divIcon({
      html: '<div class="cluster-icon' + warnCls + '" style="background-color:' + escapeHtml(color) + ';width:' + size + 'px;height:' + size + 'px;">' + cluster.getChildCount() + '</div>',
      className: '',
      iconSize: L.point(size, size)
    })
  }
}

function clusterTooltipHtml (cluster) {
  var markers = cluster.getAllChildMarkers()
  var seen = {}
  var rows = ''
  var labelOnline = language.phrases['ui.last_online'] || 'Last online'
  var labelOwner = language.phrases['ui.owner'] || 'Owner'

  rows += '<tr><th>' + escapeHtml(labelOwner) + '</th><th>' + escapeHtml(labelOnline) + '</th></tr>'

  markers.forEach(function (m) {
    var id = m.options.markerGuildId || m.options.markerCharId
    if (seen[id]) return
    seen[id] = true

    var name = m.options.markerGuildName || m.options.markerCharName || '?'
    var ts = m.options.markerGuildId
      ? guildLastOnline[m.options.markerGuildId]
      : playerLastOnline[m.options.markerCharId]
    var timeStr = fmtDateTime(ts)
    rows += '<tr><td>' + escapeHtml(name) + '</td><td>' + escapeHtml(timeStr) + '</td></tr>'
  })

  return '<div class="cluster-tooltip"><table>' + rows + '</table></div>'
}

function getActivityInfo (lastSeen) {
  if (!lastSeen) return { cls: 'grey', label: 'Неизвестно' }
  var daysAgo = Math.floor((Date.now() - lastSeen) / 86400000)
  if (daysAgo === 0) return { cls: 'green', label: 'Сегодня в сети' }
  if (daysAgo <= 7)  return { cls: 'green', label: daysAgo + ' дн. назад' }
  if (daysAgo <= 30) return { cls: 'yellow', label: daysAgo + ' дн. назад' }
  return { cls: 'grey', label: daysAgo + ' дн. назад' }
}

function getDecay () {
  if (!activeServerId) return
  $.getJSON('api/' + activeServerId + '/decay', function (d) {
    decayByOwner = d.data || {}
    decayByObject = d.byObject || {}
    computeGroupDecay()
    rebuildClanFilterMenu()
  })
}

// Per-marker decay hours for a building (null if unknown/protected).
function markerDecayHours (marker) {
  if (!marker || marker.object_id == null) return null
  var h = decayByObject[marker.object_id]
  return (h === undefined) ? null : h
}

// Warning stroke for a low-decay building marker; null = no highlight.
// Mirrors the structures-list thresholds (red <24h / overdue, yellow <72h).
function decayWarnStyle (hours) {
  if (hours === null) return null
  if (hours < 24) return { color: '#ff4d4d', weight: 3, level: 'red' }    // urgent / overdue
  if (hours < 72) return { color: '#ffb020', weight: 3, level: 'yellow' } // soon
  return null
}

// Short decay label for tooltips: "12 ч" / "5 дн" / "просрочено".
function decayShortLabel (hours) {
  if (hours <= 0) return 'просрочено'
  return hours < 48 ? Math.round(hours) + ' ч' : Math.round(hours / 24) + ' дн'
}

// Min decay per owner across only the markers actually drawn on the active map,
// so the structures list always agrees with the highlighted markers (a clan's
// decaying decorative placeables that aren't rendered no longer show "overdue").
function computeGroupDecay () {
  decayByGroup = {}
  allMarkersData.forEach(function (m) {
    if (!isOnActiveMap(m.x)) return
    var h = markerDecayHours(m)
    if (h === null) return
    var gid = m.guild_id || m.char_id || m.owner
    if (gid == null) return
    if (decayByGroup[gid] === undefined || h < decayByGroup[gid]) decayByGroup[gid] = h
  })
}

// Decay (ветшание) label + colour for an owner. Uses the min over its rendered
// markers; falls back to the backend per-owner flag only to report "protected".
function getDecayInfo (ownerId) {
  var h = decayByGroup[ownerId]
  if (h !== undefined) {
    if (h <= 0) return { cls: 'red', label: 'Просрочено' }
    var label = h < 48 ? Math.round(h) + ' ч' : Math.round(h / 24) + ' дн'
    var cls = h < 24 ? 'red' : (h < 72 ? 'yellow' : 'green')
    return { cls: cls, label: 'ветшание: ' + label }
  }
  var d = decayByOwner[ownerId]
  if (d && d.protected) return { cls: 'green', label: 'Защищено' }
  return { cls: 'grey', label: '—' }
}

// Numeric decay key for sorting; unknown/protected sort last (Infinity).
function decayHours (ownerId) {
  var h = decayByGroup[ownerId]
  return (h === undefined) ? Infinity : h
}

function updateSortButtons () {
  var labels = {
    count: language.phrases['ui.sort_by_count'] || 'By count',
    name:  language.phrases['ui.sort_by_name']  || 'By name',
    decay: language.phrases['ui.sort_by_decay'] || 'By decay'
  }
  var arrow = clanSortDir === 'asc' ? ' ↑' : ' ↓'
  $('.clan-sort-btn').each(function () {
    var m = $(this).data('sort')
    var active = clanSortMode === m
    $(this).toggleClass('active', active).text(labels[m] + (active ? arrow : ''))
  })
}

// True if any roster member of this guild matches the search query.
function rosterMatches (gid, q) {
  var r = guildRosters[gid]
  if (!r) return false
  for (var i = 0; i < r.length; i++) {
    if (r[i].name && r[i].name.toLowerCase().indexOf(q) !== -1) return true
  }
  return false
}

// Inner roster (member list) markup for a guild; '' for lone players / empty.
function rosterHtml (gid) {
  var r = guildRosters[gid]
  if (!r || !r.length) return ''
  var MAX = 60
  var rows = ''
  r.slice(0, MAX).forEach(function (m) {
    var dotCls = m.online ? 'green' : getActivityInfo(m.lastSeen).cls
    rows += '<div class="cr-member">' +
      '<span class="clan-act-dot ' + dotCls + '"></span>' +
      '<span class="cr-name">' + escapeHtml(m.name) + '</span>' +
      (m.level ? '<span class="cr-lvl">' + escapeHtml(String(m.level)) + '</span>' : '') +
    '</div>'
  })
  if (r.length > MAX) rows += '<div class="cr-more">… +' + (r.length - MAX) + '</div>'
  var head = r.length + ' ' + (language.phrases['ui.members'] || 'members')
  return '<div class="clan-roster-head">' + escapeHtml(head) + '</div>' +
         '<div class="clan-roster-list">' + rows + '</div>'
}

// Singleton roster tooltip, appended to <body> so it escapes the side panel's
// overflow:hidden / scroll clipping. Positioned next to the hovered clan item.
function rosterTipEl () {
  var el = document.getElementById('clan-roster-tip')
  if (!el) {
    el = document.createElement('div')
    el.id = 'clan-roster-tip'
    el.className = 'clan-roster-tip'
    el.addEventListener('mouseenter', function () { el.style.display = 'block' })
    el.addEventListener('mouseleave', hideRosterTip)
    document.body.appendChild(el)
  }
  return el
}

function showRosterTip (anchor, gid) {
  var html = rosterHtml(gid)
  if (!html) return
  var el = rosterTipEl()
  el.innerHTML = html
  el.style.display = 'block'
  var r = anchor.getBoundingClientRect()
  var w = el.offsetWidth, h = el.offsetHeight
  // Prefer the right side; flip to the left if it would overflow the viewport.
  var left = r.right + 8
  if (left + w > window.innerWidth - 8) left = r.left - w - 8
  if (left < 8) left = 8
  var top = r.top
  if (top + h > window.innerHeight - 8) top = Math.max(8, window.innerHeight - h - 8)
  el.style.left = left + 'px'
  el.style.top = top + 'px'
}

function hideRosterTip () {
  var el = document.getElementById('clan-roster-tip')
  if (el) el.style.display = 'none'
}

function rebuildClanFilterMenu () {
  var currentGroups = clusterGroups
  var groups = Object.keys(currentGroups)
  var menu = $('#clan-filter-menu')
  var q = ($('#clan-filter-search').val() || '').toLowerCase()

  // Build group data
  var totalCount = 0
  var groupData = groups.map(function (id) {
    var layers = currentGroups[id]
    var count = layers.getLayers ? layers.getLayers().length : 0
    totalCount += count
    return {
      id: id,
      name: groupNames[id] || id,
      color: groupColors[id] || '#666',
      count: count,
      lastSeen: guildLastOnline[id] || playerLastOnline[id] || null
    }
  })

  // Sort (bidirectional via clanSortDir)
  var dir = clanSortDir === 'asc' ? 1 : -1
  if (clanSortMode === 'name') {
    groupData.sort(function (a, b) { return a.name.localeCompare(b.name) * dir })
  } else if (clanSortMode === 'decay') {
    groupData.sort(function (a, b) { return (decayHours(a.id) - decayHours(b.id)) * dir })
  } else {
    groupData.sort(function (a, b) { return (a.count - b.count) * dir })
  }
  updateSortButtons()

  // Drop any selected clans that no longer exist
  clanFilter = clanFilter.filter(function (id) { return currentGroups[id] })

  // Render
  menu.empty()

  // All clans row
  var allLabel = (language.phrases['ui.all_clans'] || 'All clans')
  var allItem = $('<a>')
    .addClass('clan-item-all' + (clanFilter.length === 0 ? ' active' : ''))
    .attr('href', '#')
    .attr('data-clan', 'all')
    .html(escapeHtml(allLabel) + ' <span class="clan-count-badge">' + totalCount + '</span>')
    .on('click', function (e) { e.preventDefault(); selectClanFilter('all') })
  menu.append(allItem)

  // Clan rows
  groupData.forEach(function (g) {
    if (q && g.name.toLowerCase().indexOf(q) === -1 && !rosterMatches(g.id, q)) return
    var act = getDecayInfo(g.id)
    var isActive = clanFilter.indexOf(g.id) !== -1
    var item = $('<div>')
      .addClass('clan-item-expanded' + (isActive ? ' active' : ''))
      .attr('data-clan', g.id)
      .html(
        '<div class="clan-exp-top">' +
          '<span class="clan-dot" style="background:' + escapeHtml(g.color) + '"></span>' +
          '<span class="clan-exp-name">' + escapeHtml(g.name) + '</span>' +
          '<span class="clan-count-badge">' + g.count + '</span>' +
        '</div>' +
        '<div class="clan-exp-sub">' +
          '<span class="clan-act-dot ' + act.cls + '"></span>' +
          '<span class="clan-act-label ' + act.cls + '">' + escapeHtml(act.label) + '</span>' +
        '</div>'
      )
      .on('click', function () { selectClanFilter(g.id) })
    if (guildRosters[g.id] && guildRosters[g.id].length) {
      var gid = g.id
      item.on('mouseenter', function () { showRosterTip(this, gid) })
      item.on('mouseleave', hideRosterTip)
    }
    menu.append(item)
  })
}

function selectClanFilter (id) {
  if (id === 'all') {
    clanFilter = []                       // "All clans" → clear selection
  } else {
    var i = clanFilter.indexOf(id)
    if (i === -1) clanFilter.push(id)     // click new clan → add it
    else clanFilter.splice(i, 1)          // click selected clan → remove it
  }
  rebuildClanFilterMenu()
  applyClanFilter()
}

function applyClanFilter () {
  var groups = clusterGroups
  var showAll = clanFilter.length === 0
  Object.keys(groups).forEach(function (id) {
    if (showAll || clanFilter.indexOf(id) !== -1) {
      if (!map.hasLayer(groups[id])) map.addLayer(groups[id])
    } else {
      if (map.hasLayer(groups[id])) map.removeLayer(groups[id])
    }
  })
}

function pulseMarker (lm) {
  lm.setStyle({ color: 'white', weight: 4 })
  setTimeout(function () { lm.setStyle({ color: 'black', weight: 1 }) }, 2000)
}

function navigateToResult (x, y) {
  map.panTo(toLatLng(x, y))
  var lm = markerByCoords[x + ',' + y]
  if (lm) pulseMarker(lm)
}

function searchTypeLabel (kind) {
  var ph = language.phrases
  var labels = {
    thrall:   ph['ui.thrall']    || 'Thrall',
    pet:      ph['ui.pet']       || 'Pet',
    player:   ph['ui.player']    || 'Player',
    clan:     ph['ui.guild']     || 'Guild',
    building: ph['ui.buildings'] || 'Building'
  }
  return labels[kind] || kind
}

function renderSearchResult (item, type) {
  var name, sub, badge

  if (type === 'clan') {
    name = item.name
    sub = item.count + ' markers'
    badge = ''
  } else if (type === 'thrall') {
    var parsed = parseThrallInfo(item.info)
    name = item.name || '—'
    sub = (parsed.faction || '') + (item.owner ? ' · ' + (getOwnerById(item.owner) || item.owner) : '')
    badge = parsed.tier ? '<span class="badge ' + tierBadgeClass(parsed.tier) + '">' + parsed.tier + '</span>' : ''
  } else if (type === 'pet') {
    name = item.name || '—'
    sub = (item.info || '') + (item.owner ? ' · ' + (getOwnerById(item.owner) || item.owner) : '')
    badge = item.greater ? '<span class="badge badge-alpha">Alpha</span>' : ''
  } else if (type === 'player') {
    name = item.char_name || '—'
    sub = item.guild_name || ''
    badge = item.online == 1 ? '<span class="badge badge-online">● Online</span>' : ''
  } else {
    var translatedKind = (item.kind && language.phrases['items.' + item.kind]) || item.kind || item.class || ''
    name = translatedKind
    sub = item.guild_name || item.char_name || ''
    badge = ''
  }

  var el = $('<div>').addClass('search-result')
    .attr('data-x', item.x || null)
    .attr('data-y', item.y || null)
    .html(
      '<span class="result-type">' + escapeHtml(searchTypeLabel(type)) + '</span>' +
      '<div class="result-main">' +
        '<div class="result-name">' + escapeHtml(name) + '</div>' +
        (sub ? '<div class="result-sub">' + escapeHtml(sub) + '</div>' : '') +
      '</div>' +
      badge
    )
    .on('click', function () {
      if (type === 'clan') {
        selectClanFilter(item.id)
      } else {
        navigateToResult(parseFloat(item.x), parseFloat(item.y))
      }
      closePanel()
    })
  return el
}

function performSearch (query) {
  var $results = $('#search-results')
  $results.empty()
  var q = (query || '').toLowerCase().trim()
  if (!q) return

  var MAX_PER_GROUP = 10
  var groups = {
    thralls:  { label: language.phrases['ui.thralls'] || 'Thralls',  items: [] },
    pets:     { label: language.phrases['ui.pets']    || 'Pets',     items: [] },
    players:  { label: language.phrases['ui.players'] || 'Players',  items: [] },
    building: { label: language.phrases['ui.buildings'] || 'Buildings', items: [] },
    clan:     { label: language.phrases['ui.clan_filter'] || 'Clans', items: [] }
  }

  allMarkersData.forEach(function (item) {
    if (!isOnActiveMap(item.x)) return
    var kind = item._kind
    var group, fields

    if (kind === 'thralls') {
      group = groups.thralls
      var ownerName = getOwnerById(item.owner) || ''
      fields = [item.name, item.info, ownerName]
    } else if (kind === 'pets') {
      group = groups.pets
      var ownerName = getOwnerById(item.owner) || ''
      fields = [item.name, item.info, ownerName]
    } else if (kind === 'players') {
      group = groups.players
      fields = [item.char_name, item.guild_name]
    } else {
      group = groups.building
      var tKind = (item.kind && language.phrases['items.' + item.kind]) || item.kind || ''
      fields = [tKind, item.guild_name, item.char_name]
    }

    if (group.items.length >= MAX_PER_GROUP) return
    var matched = fields.some(function (s) { return s && String(s).toLowerCase().indexOf(q) !== -1 })
    if (matched) group.items.push(item)
  })

  // Clan search from groupNames
  Object.keys(groupNames).forEach(function (id) {
    if (groups.clan.items.length >= MAX_PER_GROUP) return
    var name = groupNames[id] || ''
    if (name.toLowerCase().indexOf(q) !== -1) {
      var layers = clusterGroups[id]
      var count = layers && layers.getLayers ? layers.getLayers().length : 0
      groups.clan.items.push({ id: id, name: name, count: count, _clan: true })
    }
  })

  var hasAny = false
  var typeKeys = ['thralls', 'pets', 'players', 'building', 'clan']
  typeKeys.forEach(function (key) {
    var g = groups[key]
    if (!g.items.length) return
    hasAny = true
    $results.append('<div class="search-group-label">' + escapeHtml(g.label) + ' (' + g.items.length + ')</div>')
    g.items.forEach(function (item) {
      $results.append(renderSearchResult(item, key === 'building' ? key : key.replace(/s$/, '')))
    })
  })

  if (!hasAny) {
    $results.html('<div class="search-empty">Nothing found</div>')
  }
}

function getPlayers () {
  if (!activeServerId) return
  $.getJSON('api/' + activeServerId + '/players', function (data) {
    playersData = data.data
    playerLastOnline = {}
    guildLastOnline = {}
    guildRosters = {}

    data.data.forEach(function (player) {
      // Roster: every guild member (regardless of last_online presence).
      if (player.guild_id && player.guild_id !== 'NULL') {
        if (!guildRosters[player.guild_id]) guildRosters[player.guild_id] = []
        var ts0 = player.last_online ? new Date(player.last_online.replace(' ', 'T') + 'Z').getTime() : null
        guildRosters[player.guild_id].push({
          name: player.char_name || '?',
          level: player.level || null,
          online: player.online == 1,
          lastSeen: isNaN(ts0) ? null : ts0
        })
      }

      if (!player.last_online) return
      var ts = new Date(player.last_online.replace(' ', 'T') + 'Z').getTime()
      if (isNaN(ts)) return

      if (player.char_id && player.char_id !== 'NULL') {
        playerLastOnline[player.char_id] = ts
      }
      if (player.guild_id && player.guild_id !== 'NULL') {
        if (!guildLastOnline[player.guild_id] || ts > guildLastOnline[player.guild_id]) {
          guildLastOnline[player.guild_id] = ts
        }
      }
    })

    // Sort each roster: online first, then most-recently-seen, then name.
    Object.keys(guildRosters).forEach(function (gid) {
      guildRosters[gid].sort(function (a, b) {
        if (a.online !== b.online) return a.online ? -1 : 1
        if ((b.lastSeen || 0) !== (a.lastSeen || 0)) return (b.lastSeen || 0) - (a.lastSeen || 0)
        return a.name.localeCompare(b.name)
      })
    })

    rebuildClanFilterMenu()
  })
}

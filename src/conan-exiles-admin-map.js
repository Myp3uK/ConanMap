import fs from 'fs'
import os from 'os'
import path from 'path'
import { exec } from 'child_process'
import express from 'express'
import SysTray from 'systray2'

import middleware from './middleware'
import routes from './routes'

const app = express()

middleware(app)
routes(app)

const port = app.get('port')
const host = app.get('host')

app.listen(port, host, () => {
  console.log(`App listening on http://${host}:${port}`)
  const url = `http://localhost:${port}/`
  openBrowser(url)
  startTray(url)
})

function openBrowser(url) {
  const cmd =
    process.platform === 'win32' ? `start "" "${url}"` :
    process.platform === 'darwin' ? `open "${url}"` :
    `xdg-open "${url}"`
  exec(cmd)
}

function resolveIcon() {
  // Under pkg the virtual fs can't be read by external processes, copy to tmp
  const iconSrc = path.join(__dirname, '../public/assets/icon.ico')
  if (process.pkg) {
    const dest = path.join(os.tmpdir(), 'conan-admin-map-icon.ico')
    if (!fs.existsSync(dest)) {
      fs.copyFileSync(iconSrc, dest)
    }
    return dest
  }
  return iconSrc
}

function startTray(url) {
  let icon
  try {
    icon = resolveIcon()
  } catch (e) {
    return // skip tray if icon unavailable (e.g. dev without public/)
  }

  const tray = new SysTray({
    menu: {
      icon,
      title: '',
      tooltip: `Conan Exiles Admin Map — port ${port}`,
      items: [
        {
          title: 'Open in browser',
          tooltip: url,
          checked: false,
          enabled: true,
          click: () => openBrowser(url),
        },
        SysTray.separator,
        {
          title: 'Stop server',
          tooltip: 'Shut down the admin map',
          checked: false,
          enabled: true,
          click: () => {
            tray.kill(false)
            process.exit(0)
          },
        },
      ],
    },
    debug: false,
    copyDir: os.tmpdir(),
  })

  tray.onClick(action => {
    if (action.item.click) action.item.click()
  })

  tray.ready().catch(err => {
    console.error('Tray failed:', err.message)
  })
}

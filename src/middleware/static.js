import { join } from 'path'
import express from 'express'

const staticMiddleware = (app) => {
  const root = join(app.get('rootFolder'), 'public/assets')
  app.use('/assets/tiles', express.static(join(root, 'tiles'), { maxAge: '365d' }))
  app.use('/assets/tiles-siptah', express.static(join(root, 'tiles-siptah'), { maxAge: '365d' }))
  app.use('/assets', express.static(root))
}

export default staticMiddleware

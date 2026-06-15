import { apiRoutes } from './api'

const routes = (app) => {
  apiRoutes(app)

  app.get('/', (req, res) => {
    res.render('index', {
      lang: res.lang.phrases,
      language: JSON.stringify(res.lang),
      lastupdate: ''
    })
  })

  app.use((req, res) => {
    res.status(404).json({ error: { status: 404, message: 'Not Found' } })
  })
}

export default routes

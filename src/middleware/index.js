import applicationMiddleware from './app'
import authMiddleware from './auth'
import languageMiddleware from './language'
import staticMiddleware from './static'

const middleware = (app) => {
  applicationMiddleware(app)
  authMiddleware(app)
  languageMiddleware(app)
  staticMiddleware(app)
}

export default middleware

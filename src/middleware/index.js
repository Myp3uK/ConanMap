import applicationMiddleware from './app'
import sessionMiddleware from './session'
import languageMiddleware from './language'
import staticMiddleware from './static'

const middleware = (app) => {
  applicationMiddleware(app)
  sessionMiddleware(app)
  languageMiddleware(app)
  staticMiddleware(app)
}

export default middleware

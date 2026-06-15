#!/usr/bin/env node
// Generate a scrypt password hash for the [AUTH] section.
// Usage:  npm run set-password <password>           -> prints the hash
//         npm run set-password <username> <password> -> prints "username = hash"
import { hashPassword, passwordIssues } from '../src/services/auth.js'

const args = process.argv.slice(2)
if (args.length === 0) {
  console.error('Usage: npm run set-password [username] <password>')
  process.exit(1)
}

const username = args.length >= 2 ? args[0] : null
const password = args.length >= 2 ? args.slice(1).join(' ') : args[0]

const issues = passwordIssues(password)
if (issues.length) {
  console.error('Password too weak. It must contain: ' + issues.join(', ') + '.')
  process.exit(1)
}

const hash = hashPassword(password)
if (username) {
  console.log(`${username} = ${hash}`)
} else {
  console.log(hash)
}
console.error('\nAdd the line above under the [AUTH] section of conan-exiles-admin-map.ini')

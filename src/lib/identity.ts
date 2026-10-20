/** Display helpers for the signed-in user. Pure functions; no session access. */
export type UserIdentity = { name: string; email: string }

/** The account name, else the part of the email before the @. */
export function displayName(user: UserIdentity) {
  return user.name.trim() || user.email.split('@')[0] || 'there'
}

export function firstName(user: UserIdentity) {
  return displayName(user).split(/\s+/)[0]
}

/** First letter or digit of the display name, upper-cased, for the avatar. */
export function initial(user: UserIdentity) {
  return (displayName(user).match(/\p{L}|\p{N}/u)?.[0] ?? '?').toLocaleUpperCase()
}

export function greeting(hour = new Date().getHours()) {
  return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
}

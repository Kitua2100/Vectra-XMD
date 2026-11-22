/** Safe built-ins; original plugins must be audited and adapted separately. */
export function registerBuiltins(router) {
  router.register('ping', async ({ reply }) => reply('pong'));
  router.register('help', async ({ reply }) => reply('Commands: !ping, !help'));
  return router;
}

/**
 * Babel plugin: drop console.log / console.info / console.debug calls from release
 * bundles. console.warn and console.error are kept.
 *
 * WHY A BABEL PLUGIN. With Hermes the React Native Gradle plugin turns Metro's
 * minifier OFF (TaskConfiguration.kt: minifyEnabled = !hermesEnabled), so a Terser
 * `drop_console` setting never runs. Babel runs either way.
 *
 * On Android these calls cross the bridge to logcat, and several sit inside
 * Firestore snapshot callbacks (chat list, community discovery), so they run on
 * every snapshot. Arguments are dropped with the call, as babel-plugin-transform-
 * remove-console does.
 */
const STRIPPED = new Set(['log', 'info', 'debug']);

module.exports = function removeConsole({ types: t }) {
  return {
    name: 'bama-remove-console',
    visitor: {
      CallExpression(path) {
        const callee = path.node.callee;
        if (
          t.isMemberExpression(callee) &&
          !callee.computed &&
          t.isIdentifier(callee.object, { name: 'console' }) &&
          t.isIdentifier(callee.property) &&
          STRIPPED.has(callee.property.name)
        ) {
          if (path.parentPath.isExpressionStatement()) {
            path.parentPath.remove();
          } else {
            // e.g. `cond && console.log(x)` or an arrow body: keep the expression valid.
            path.replaceWith(t.unaryExpression('void', t.numericLiteral(0)));
          }
        }
      },
    },
  };
};

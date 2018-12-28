import http from 'http';
import koa from 'koa';
import { resolvePlugins, applyPlugins } from './plugin';
import log from 'spm-log';
import async from 'async';
import { join } from 'path';
import notify from 'umi-notify';

const defaultCwd = process.cwd();
const defaultArgs = {
  port: '8000',
  cwd: defaultCwd,
  enabledMiddlewareServeIndex: true,
  enabledMiddlewareStatic: true,
  resolveDir: [defaultCwd],
};
const data = {};

export default function createServer(_args, callback) {
  notify.onDevStart({ name: 'dora', version: '0.6' });

  const args = { ...defaultArgs, ..._args };
  log.config(args);

  const { port, cwd, resolveDir } = args;
  const pluginNames = args.plugins;
  const context = { port, cwd };
  context.set = (key, val) => {
    data[key] = val;
  };
  context.get = key => data[key];
  context.set('__server_listen_log', true);

  if (args.enabledMiddlewareStatic) {
    pluginNames.push(join(__dirname, './plugins/static'));
  }
  if (args.enabledMiddlewareServeIndex) {
    pluginNames.push(join(__dirname, './plugins/serve-index'));
  }

  const plugins = resolvePlugins(pluginNames, resolveDir, cwd);
  function _applyPlugins(name, pluginArgs, _callback) {
    return applyPlugins(plugins, name, context, pluginArgs, _callback);
  }
  context.applyPlugins = _applyPlugins;
  log.debug('dora', `[plugins] ${JSON.stringify(plugins)}`);

  const app = context.app = koa();
  let server;

  process.on('exit', () => {
    _applyPlugins('process.exit');
  });

  async.series([
    next => _applyPlugins('middleware.before', null, next),
    next => _applyPlugins('middleware', null, next),
    next => _applyPlugins('middleware.after', null, next),
    next => { server = context.server = http.createServer(app.callback()); next(); },
    next => _applyPlugins('server.before', null, next),
    next => {
      server.listen(port, () => {
        if (context.get('__server_listen_log')) {
          log.info('dora', `listened on ${port}`);
        }
        context.set('__ready', true);
        next();
      });
    },
    next => _applyPlugins('server.after', null, next),
  ], callback);
}

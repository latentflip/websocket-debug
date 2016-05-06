'use strict';

(() => {
  // helpers --------------------------------------------------------

  // use chrome's built-in pretty logging of "html" elements to
  // pretty print xml
  const prettyPrintXml = (xml, options) => {
    const div = document.createElement('div');
    div.innerHTML = xml;
    return div.firstChild;
  };

  const valueMatchesFilter = (value, filter) => {
    if (typeof filter === 'function') {
      return !!(filter(value));
    }

    if (filter instanceof RegExp) {
      return !!(value.match(filter));
    }

    return filter === value;
  };

  // checks if the object matches all the filters in the filterset
  //
  // each key in filters should match a key in object
  // the filter for that key will be checked against the object's
  // value for that key with valueMatchesFilter
  //
  // if the key in the filter is prefixed with "!" it will invert
  // the match
  const objectMatchesFilterSet = (object, filters) => {
    const keys = Object.keys(filters);

    if (keys.length === 0) {
      return true;
    }

    // the object must match all the filters
    return keys.every((k) => {
      // invert if filter key starts with "!"
      if (k[0] === '!') {
        return !valueMatchesFilter(object[k.slice(1)], filters[k]);
      }
      return valueMatchesFilter(object[k], filters[k]);
    });
  };

  // nicely format time delta (delta is in milliseconds)
  // 0->9:        "+Nms  "
  // 10->99:      "+NNms "
  // 100->999:    "+NNNms"
  // 1000->9999   "+N.NNs"
  // 10000->59999 "+NN.Ns"
  // 60000+       "+NNmNNs
  const formatDelta = (delta) => {
    const ONE_MINUTE = 60 * 1000;

    // pos/neg sign
    const s = delta >= 0 ? '+' : '-';

    // ms only
    if (delta < 10) { return `${s}${delta}ms  `; }
    if (delta < 100) { return `${s}${delta}ms `; }
    if (delta < 1000) { return `${s}${delta}ms`; }

    // secs
    if (delta < 10000) {
      const secs = delta / 1000;
      // 2 decimal places ideally, but toFixed rounds up
      return `${s}${secs.toFixed(2).substr(0, 4)}s`;
    }

    if (delta < ONE_MINUTE) {
      const secs = delta / 1000;

      return `${s}${secs.toFixed(1).substr(0, 4)}s`;
    }

    // mins + secs
    {
      const mins = Math.floor(delta / ONE_MINUTE);
      const secs = Math.floor((delta - (mins * ONE_MINUTE)) / 1000);
      return `${s}${mins}m${secs}s`;
    }
  };

  const STYLE_IN = 'color:rgb(164, 86, 3);font-weight:bold';
  const STYLE_OUT = 'color:rgb(3, 194, 7);font-weight:bold';

  const prettyPrintRow = (row, timedelta, { noxml, transform } = {}) => {
    let txt = row.msg.trim();

    if (typeof transform === 'function') {
      txt = transform(txt);
    }

    // if it looks like xml, and noxml is not set, pretty print it
    // otherwise try parsing as json in case
    if (!noxml && txt[0] === '<' && txt[txt.length - 1] === '>') {
      txt = prettyPrintXml(txt);
    } else {
      try {
        txt = JSON.parse(txt);
      } catch (e) {}
    }

    const symbol = row.direction === 'in' ? '⬇︎' : '⬆︎';
    const style = row.direction === 'in' ? STYLE_IN : STYLE_OUT;

    // log prettily
    console.log(`%c${symbol}${formatDelta(timedelta)}`, style, txt);
  };

  // override websocket, and export module to window ----------------
  const _WebSocket = window.WebSocket;
  const sockets = {};
  let socketIdCounter = 0;
  let messages = [];

  // if disabled will be false
  // if enabled will be timestamp of last message
  let live = false;
  let liveOptions = {};

  const addMessage = (message) => {
    messages.push(message);

    if (live) {
      if (objectMatchesFilterSet(message, liveOptions.filter || liveOptions.filters || {})) {
        prettyPrintRow(message, message.time - live, liveOptions);
        live = message.time;
      }
    }
  };

  // replace native websocket constructor
  window.WebSocket = function WebSocket (url, protocols) {
    // save socket url in the id map for referencing later
    const id = socketIdCounter++;
    sockets[url] = id;

    // init the socket
    const socket = new _WebSocket(url, protocols);

    // replace Websocket's send method with a logging one
    const _send = socket.send;
    socket.send = function (msg) {
      addMessage({
        socket_id: id,
        direction: 'out',
        time: Date.now(),
        msg
      });
      _send.call(this, msg);
    };

    // add an event listener for incoming messages
    socket.addEventListener('message', (msg) => {
      addMessage({
        socket_id: id,
        direction: 'in',
        time: Date.now(),
        msg: msg.data
      });
    });

    return socket;
  };

  const defaultColumns = ['socket_id', 'direction', 'time', 'msg'];

  const websocketDebug = window.websocketDebug = {
    logs ({ columns = defaultColumns, filters, filter, limit = null, raw = false, transform } = {}) {
      filters = filters || filter || {};

      let logs = messages.map((log) => {
        if (!objectMatchesFilterSet(log, filters)) {
          return;
        }

        if (typeof transform === 'function') {
          log = Object.assign({}, log, {
            msg: transform(log.msg)
          });
        }

        if (raw) {
          return log;
        }

        return columns.map((c) => log[c]);
      }).filter((row) => !!row);

      if (limit) {
        logs = logs.slice(-limit);
      }

      return logs;
    },

    pretty (options = {}) {
      // call the base logger, overriding some options we don't care about
      const opts = Object.assign({}, options, {
        columns: undefined,
        raw: true
      });
      const rows = websocketDebug.logs(opts);

      let lastTime = rows[0] && rows[0].time;

      rows.forEach((row) => {
        const timedelta = row.time - lastTime;
        lastTime = row.time;
        prettyPrintRow(row, timedelta, { noxml: options.noxml });
      });
    },

    csv (options) {
      return websocketDebug.logs(options)
                           .join('\n');
    },

    get sockets () {
      return sockets;
    },

    get defaultColumns () {
      return defaultColumns;
    },

    clear () {
      messages = [];
    },

    live (options = {}) {
      // don't reset timestamps if just updating config
      live = live || Date.now();
      liveOptions = options;
    },

    stopLive () {
      live = false;
      liveOptions = null;
    }
  };
})();

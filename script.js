(function () {
  var _WebSocket = window.WebSocket;
  var id = 0;
  var messages = [];
  var defaultColumns = ['socket_id', 'direction', 'time', 'msg'];
  var sockets = {
  };
  var live;

  var prettyPrintXml = function (xml, options) {
    var div= document.createElement('div')
    div.innerHTML = xml;
    return div.firstChild;
  };


  var isMatch = function (value, filter) {
    if (typeof filter === 'function') {
      return !!(filter(value));
    }
    if (filter instanceof RegExp) {
      return !!(value.match(filter));
    }
    return filter === value;
  };

  var keep = function (object, filters) {
    var keys = Object.keys(filters);
    if (keys.length === 0) {
      return true;
    }
    return keys.every((k) => {
      if (k[0] === '!') {
        return !isMatch(object[k.slice(1)], filters[k])
      }
      return isMatch(object[k], filters[k]);
    });
  };

  var formatDelta = (delta) => {
    var s = delta >= 0 ? '+' : '-';
    if (delta < 1000) {
      if (delta < 10) {
        return `${s}${delta}ms  `;
      } else if (delta < 100) {
        return `${s}${delta}ms `;
      } else {
        return `${s}${delta}ms`;
      }
    }
    if (delta < 60*1000) {
      const dp = delta >= 10*1000 ? 1 : 2;
      return `${s}${(delta/1000).toFixed(dp)}s`;
    }
    var mins = Math.floor(delta/(60*1000));
    var secs = Math.floor((delta - (mins * 60 * 1000)) / 1000);
    return `${s}${mins}m${secs}s`;
  }
  window.formatDelta = formatDelta;

  window.WebSocket = function (url, protocols) {
    var _id = id++;
    sockets[url] = _id;

    var socket = new _WebSocket(url, protocols);

    var _send = socket.send;

    socket.send = function (msg) {
      messages.push({
        socket_id: _id,
        direction: 'out',
        time: Date.now(),
        msg: msg
      });
      _send.call(this, msg);
    }

    socket.addEventListener('message', function (msg) {
      messages.push({
        socket_id: _id,
        direction: 'in',
        time: Date.now(),
        msg: msg.data
      });
    });

    return socket;
  }

  window.websocketDebug = {
    logs(options) {
      var options = options || {};
      var columns = options.columns || defaultColumns;
      var filters = options.filters || {};
      var limit = options.limit || null;
      var raw = options.raw || false;
      var msgs = messages;

      if (limit) {
        msgs = msgs.slice(-1*limit);
      }

      return msgs.map((msg) => {
        if (!keep(msg, filters)) {
          return;
        }
        if (raw) {
          return msg;
        }
        return columns.map((c) => msg[c]);
      })
        .filter((row) => !!row) // remove filtered rows
    },

    pretty(options) {
      options = options || {};
      var opts = Object.assign({}, options, {
        columns: undefined,
        raw: true
      });

      var rows = websocketDebug.logs(opts)
      var lastTime = rows[0] && rows[0].time;

      rows.forEach((row) => {
        var txt = row.msg.trim();
        if (!options.noxml && txt[0] === '<' && txt[txt.length - 1] === '>') {
          txt = prettyPrintXml(txt);
        } else {
          try {
            txt = JSON.parse(txt);
          } catch (e) {
            console.log(e)
          }
        }

        if (row.direction === 'in') {
          console.log(`%c⬇︎ ${formatDelta(row.time - lastTime)}`, 'color:rgb(164, 86, 3);font-weight:bold', txt);
        } else {
          console.log(`%c⬆︎ ${formatDelta(row.time - lastTime)}`, 'color:rgb(3, 194, 7);font-weight:bold', txt);
        }
        lastTime = row.time;
      });
    },

    csv(options) {
      return websocketDebug.logs(options)
                           .join('\n');
    },

    get sockets() {
      return sockets;
    },

    get defaultColumns() {
      return defaultColumns;
    },

    clear() {
      messages = [];
    }
  };
})();

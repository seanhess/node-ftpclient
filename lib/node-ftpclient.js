(function(){
  var client, createClient, fs, net, path, sys;
  sys = require("sys");
  net = require("net");
  path = require("path");
  fs = require("fs");
  createClient = function(port, host, callback) {
    var authenticate, client, close, command, ftpClient, get, lcd, list, localDirectory, ls;
    localDirectory = ".";
    client = net.createConnection(port, host);
    client.setTimeout(0);
    client.addListener("connect", function() {
      var onData;
      onData = function(data) {
        client.removeListener("data", onData);
        return callback();
      };
      return client.addListener("data", onData);
    });
    client.addListener("end", function() {
      throw new Error("FTP Client Ended Unexpectedly");
    });
    client.addListener("timeout", function() {
      throw new Error("FTP Client Timed Out Unexpectedly");
    });
    client.addListener("close", function(hadError) {
      if (hadError) {
        throw new Error("FTP Client Closed");
      }
    });
    close = function() {
      client.end();
      return client.destroy();
    };
    authenticate = function(user, pass, callback) {
      return command(("USER " + user), function(data) {
        return command(("PASS " + pass), function(data) {
          return callback();
        });
      });
    };
    command = function(command, callback, delimiter) {
      var allData, onData;
      delimiter = (typeof delimiter !== "undefined" && delimiter !== null) ? delimiter : "\n";
      delimiter = new RegExp(delimiter, "im");
      exports.showCommands ? sys.puts(("Command: " + (command))) : null;
      client.write(command + "\n");
      allData = "";
      onData = function(data) {
        var statusMatch;
        data = data.toString();
        statusMatch = data.match(/^\d\d\d/);
        if ((typeof statusMatch !== "undefined" && statusMatch !== null) && parseInt(statusMatch[0]) > 399) {
          throw new Error("FTP || " + data);
        }
        allData += data;
        exports.showData ? sys.puts(("Data: " + (data))) : null;
        if (allData.match(delimiter)) {
          client.removeListener("data", onData);
          return callback(allData);
        }
      };
      return client.addListener("data", onData);
    };
    list = function(dir, callback) {
      return command(("STAT " + (dir)), callback, "211 End of status");
    };
    lcd = function(dir) {
      localDirectory = dir;
      return localDirectory;
    };
    ls = function(dir, callback) {
      return list(dir, function(data) {
        var _a, _b, _c, files, line, lines, match;
        lines = data.split(/\n/);
        files = [];
        _b = lines;
        for (_a = 0, _c = _b.length; _a < _c; _a++) {
          line = _b[_a];
          match = line.match(/\s+(\S+)\s*$/);
          if (!(typeof match !== "undefined" && match !== null)) {
            continue;
          }
          if (match[1].match(/^\./)) {
            continue;
          }
          files.push(match[1]);
        }
        return callback(files);
      });
    };
    get = function(file, callback) {
      exports.showGetProgress ? sys.puts("GET " + file) : null;
      return command("PASV", function(data) {
        var basename, destpath, gethost, getport, parts;
        parts = data.match(/(\d+),(\d+),(\d+),(\d+),(\d+),(\d+)/);
        if (!(typeof parts !== "undefined" && parts !== null)) {
          throw new Error(("Could not get PASV data (" + data + ") -- (" + (sys.inspect(parts)) + ")"));
        }
        gethost = parts[1] + "." + parts[2] + "." + parts[3] + "." + parts[4];
        getport = parseInt(parts[5]) * 256 + parseInt(parts[6]);
        exports.showGetProgress ? sys.puts(" - " + gethost + ":" + getport) : null;
        basename = path.basename(file);
        destpath = path.join(localDirectory, basename);
        return fs.open(destpath, "w", 0775, function(err, fd) {
          var chunks, done, getclient, next, running;
          if (err) {
            throw err;
          }
          exports.showGetProgress ? sys.puts(" - opened") : null;
          chunks = [];
          done = false;
          running = false;
          next = function() {
            var chunk;
            running = true;
            chunk = chunks.shift();
            if (!(typeof chunk !== "undefined" && chunk !== null)) {
              if (done) {
                getclient.end();
                getclient.destroy();
                fs.close(fd, function(err) {                });
              }
              running = false;
              return null;
            }
            return fs.write(fd, chunk, null, 'binary', function(err, written) {
              exports.showGetProgress ? sys.puts(" - get chunk: " + written) : null;
              return next();
            });
          };
          getclient = net.createConnection(getport, gethost);
          getclient.setTimeout(0);
          getclient.setEncoding('binary');
          getclient.addListener("timeout", function() {
            throw new Error("Unexpected GetClient Timeout");
          });
          getclient.addListener("close", function(err) {
            if (exports.showGetProgress) {
              return sys.puts(" - get close");
            }
          });
          getclient.addListener("connect", function() {
            var onTransferComplete;
            exports.showGetProgress ? sys.puts(" - get connected") : null;
            onTransferComplete = function(data) {
              exports.showGetProgress ? sys.puts(" - transfer complete") : null;
              return callback(destpath);
            };
            return command(("RETR " + (file)), onTransferComplete, "226 Transfer Complete");
          });
          getclient.addListener("data", function(data) {
            exports.showGetProgress ? sys.puts((" - get data: " + (data.length))) : null;
            chunks.push(data);
            if (!(running)) {
              return next();
            }
          });
          return getclient.addListener("end", function() {
            exports.showGetProgress ? sys.puts(" - get end") : null;
            getclient.end();
            done = true;
            return done;
          });
        });
      });
    };
    ftpClient = {
      close: close,
      command: command,
      authenticate: authenticate,
      list: list,
      get: get,
      lcd: lcd,
      ls: ls
    };
    return ftpClient;
  };
  client = function(host, port, user, pass) {
    var tempClient;
    tempClient = function(onDone) {
      var tmp;
      tmp = createClient(port, host, function() {
        return tmp.authenticate(user, pass, function() {
          return onDone(tmp);
        });
      });
      return tmp;
    };
    return {
      ls: function(dir, callback) {
        return tempClient(function(client) {
          return client.ls(dir, function(files) {
            client.close();
            return callback(files);
          });
        });
      },
      get: function(source, destFolder, callback) {
        return tempClient(function(client) {
          client.lcd(destFolder);
          return client.get(source, function(path) {
            client.close();
            return callback(path);
          });
        });
      }
    };
  };
  exports.createClient = createClient;
  exports.client = client;
  exports.showData = false;
  exports.showCommands = false;
  exports.showGetProgress = false;
})();

# telnet ftp.tvdata.com 21
# USER utcitv
# PASS chu35llc
# STAT On2
# PWD
# PASV
# CWD On2
# STAT .
# PASV
# RETR

sys: require "sys"
net: require "net"
path: require "path"
fs: require "fs"

createClient: (port, host, callback) ->     
    localDirectory: "."
    client: net.createConnection port, host
    
    client.setTimeout 0
    
    client.addListener "connect", () -> 
        onData: (data) -> 
            client.removeListener "data", onData
            callback()
        client.addListener "data", onData
        
    client.addListener "end", () -> throw new Error("FTP Client Ended Unexpectedly")
    client.addListener "timeout", () -> throw new Error("FTP Client Timed Out Unexpectedly")
    client.addListener "close", (hadError) -> if hadError then throw new Error("FTP Client Closed") 
    
    close: () ->
        client.end()
        client.destroy()

    authenticate: (user, pass, callback) -> 
        command "USER $user", (data) ->
            command "PASS $pass", (data) ->
                callback()
        
    command: (command, callback, delimiter) ->
        delimiter ?= "\n"
        delimiter = new RegExp(delimiter, "im")
        if exports.showCommands then sys.puts "Command: ${command}"
        client.write command + "\n"
        allData: ""
        onData: (data) ->
            data: data.toString()
            statusMatch = data.match /^\d\d\d/
            if statusMatch? and parseInt(statusMatch[0]) > 399
                throw new Error("FTP || $data")                
            
            allData += data
            
            if exports.showData then sys.puts "Data: ${data}"
                    
            if allData.match delimiter
                client.removeListener "data", onData
                callback(allData)
                
        client.addListener "data", onData
        
    list: (dir, callback) -> command "STAT ${dir}", callback, "211 End of status"
    # cd: (dir, callback) -> command "CWD ${dir}", callback
    lcd: (dir) -> localDirectory: dir
    ls: (dir, callback) -> 
        list dir, (data) ->
            lines = data.split /\n/
            files = []
            for line in lines
                match = line.match /\s+(\S+)\s*$/
                continue if not match?
                continue if match[1].match /^\./
                files.push match[1]
            callback files    

    get: (file, callback) ->
        if exports.showGetProgress then sys.puts "GET $file"
        command "PASV", (data) ->
            parts = data.match /(\d+),(\d+),(\d+),(\d+),(\d+),(\d+)/
            throw new Error("Could not get PASV data ($data) -- (${sys.inspect(parts)})") unless parts?
            # sys.puts data
            gethost = parts[1] + "." + parts[2] + "." + parts[3] + "." + parts[4]
            getport = parseInt(parts[5]) * 256 + parseInt(parts[6])
            
            if exports.showGetProgress then sys.puts " - $gethost:$getport"            
            
            # Open local file for saving
            basename = path.basename file
            destpath = path.join localDirectory, basename
            
            fs.open destpath, "w", 0775, (err, fd) ->
                if (err) then throw err
                if exports.showGetProgress then sys.puts " - opened"
            
                chunks = []

                done: no
                running: no
                next: () -> 
                    running: yes

                    chunk = chunks.shift()
                    
                    if not chunk?
                        if done
                            getclient.end()
                            getclient.destroy()
                            fs.close fd, (err) -> # sys.puts "- close $err"
                        running: no
                        return
                        
                    fs.write fd, chunk, null, 'binary', (err, written) -> 
                        if exports.showGetProgress then sys.puts " - get chunk: $written"            
                        next()
                        

                # Create Server
                getclient: net.createConnection getport, gethost
                getclient.setTimeout 0
                getclient.setEncoding 'binary'
                getclient.addListener "timeout",    () -> throw new Error("Unexpected GetClient Timeout")
                getclient.addListener "close",   (err) -> 
                    if exports.showGetProgress then sys.puts " - get close"            
                
                # We are ready
                getclient.addListener "connect",    () -> 
                    if exports.showGetProgress then sys.puts " - get connected"            
                    onTransferComplete: (data) ->
                        if exports.showGetProgress then sys.puts " - transfer complete"            
                        callback destpath
                        
                    command "RETR ${file}", onTransferComplete, "226 Transfer Complete"

                getclient.addListener "data",   (data) ->
                    if exports.showGetProgress then sys.puts " - get data: ${data.length}"
                    chunks.push data
                    next() unless running
                    
                getclient.addListener "end",        () -> 
                    if exports.showGetProgress then sys.puts " - get end"
                    getclient.end()
                    done: yes
            
        
    ftpClient: {
        close: close
        command: command
        authenticate: authenticate
        list: list
        get: get
        lcd: lcd
        ls: ls
    }
    
# Gives you a oneoff client
# Every major function only happens once
client: (host, port, user, pass) ->
    tempClient: (onDone) ->
        tmp: createClient port, host, ->
            tmp.authenticate user, pass, ->
                onDone(tmp)
    
    {
        # Gives you a directory listing
        ls: (dir, callback) ->
            tempClient (client) ->
                client.ls dir, (files) -> 
                    client.close()
                    callback(files)

        # Fetches a file for you
        get: (source, destFolder, callback) ->
            tempClient (client) ->
                client.lcd destFolder
                client.get source, (path) -> 
                    client.close()
                    callback(path)
    }   
    

exports.createClient: createClient
exports.client: client
exports.showData: no
exports.showCommands: no
exports.showGetProgress: no

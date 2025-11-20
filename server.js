var crypto = require('crypto');
var readline = require('readline');
var express = require('express');
var socketio = require('socket.io');
var app = express();
const { getUsernameByCode, addCode, codes } = require('./codes');
var favicon = require('serve-favicon');
var passport = require('passport');
var SteamStrategy = require('passport-steam').Strategy;

var Config;

try {
    Config = require('./config.js');
} catch (e) {
    console.log('\x1b[31m%s\x1b[0m', 'Failed to load config.js'); // red
    console.log('\x1b[33m%s\x1b[0m', 'Make sure you copied and renamed config.template.js to config.js'); // yellow
    process.exit(1);
}

var Box = require('./boxes/shared/Box');
var Dispatcher = require('./boxes/shared/Dispatcher');

//SteamAPI Checking 
if (!Config.LoginWithCode && !Config.offlineMode) {
    try {
        if (
            Config.steamAPIKey.length !== 32 ||
            Config.steamAPIKey !== Config.steamAPIKey.replace(/\W/g, '')
        ) {
            throw new Error("invalid");
        }
    } catch (e) {
        console.log('\x1b[31m%s\x1b[0m', 'Invalid Steam API key'); // red
        console.log('\x1b[33m%s\x1b[0m', 'Please add your Steam API key to config.js'); // yellow
        console.log('\x1b[36m%s\x1b[0m', 'or enable "offline mode" or "Login with code" in config.js'); // cyan
        process.exit(1);
    }
}


//loads boxes from the /boxes directory and preps for making console commands
var BoxObjects = {};
var BoxNames = [];

require("fs").readdirSync(require("path").join(__dirname, "boxes")).forEach(function(file) {
    var fileNameMinusTheDotJS = file.substr(0, file.length - 3);

    //prevent it from loading the template and makes sure the id and filename match (not strictly necessary...)
    if (!fileNameMinusTheDotJS.startsWith('_') && file !== 'shared') {
        var tempObject = require("./boxes/" + file);
        if (tempObject.id === fileNameMinusTheDotJS) {
            var boxName = fileNameMinusTheDotJS.toLowerCase();
            //place each script into the object literal
            BoxObjects[boxName] = require("./boxes/" + file);
            //place each object name in to BoxNames
            BoxNames.push(boxName);
        }
    }
});


//handlebars setup
var hbs = require('express-handlebars').create({
    defaultLayout: 'main'
});
app.engine('handlebars', hbs.engine);
app.set('view engine', 'handlebars');
app.use(express.static(__dirname + '/public'));

app.use(passport.initialize());
app.use(passport.session());
passport.serializeUser(function(user, done) {
    done(null, user);
});

passport.deserializeUser(function(obj, done) {
    done(null, obj);
});

let clockMode = false;


app.use((req, res, next) => {
  if (clockMode && req.path !== '/clockmode' && !req.path.startsWith('/clockmode/')) {
    return res.redirect('/clockmode');
  }
  next();
});

// Clockmode toggle command
app.get('/clockmode/:state', (req, res) => {
  const state = req.params.state.toLowerCase();
  if (state === 'on') {
    clockMode = true;
    console.log('Clockmode: ON');
    return res.redirect('/clockmode');
  }
  if (state === 'off') {
    clockMode = false;
    console.log('Clockmode: OFF');
    return res.redirect('/main');
  }
  res.status(400).send('Usage: clockmode/[on|off]');
});


app.get('/clockmode', exposeTemplates, function (req, res) {
  res.render('clockmode', {
    layout: 'nonstream'
  });
});

// Normál oldalak
app.get('/', exposeTemplates, function (req, res) {
  res.render('home', {
    layout: 'nonstream'
  });
});

app.get('/main', exposeTemplates, function (req, res) {
  res.render('main', {
    layout: 'stream'
  });
});

app.get('/admin', exposeTemplates, function (req, res) {
  res.render('admin', {
    layout: 'stream'
  });
});

app.get('/api/config', (req, res) => {
    res.json({
        LoginWithCode: Config.LoginWithCode
    });
});

app.get('/stream', (req, res) => {
  res.render('stream', { videoId: 'ukHo-c7jbH0' });
});


//start server
var io = socketio.listen(app.listen(Config.port, function() {
    console.log('\x1b[32m%s\x1b[0m', 'Lansite is now running on localhost:' + Config.port + '. Type "stop" to close.');
}));

function exposeTemplates(req, res, next) {
    hbs.getTemplates('templates/').then(function(templates) {

        // Creates an array of templates which are exposed via
        // `res.locals.templates`.
        var boxes = Object.keys(templates).map(function(name) {
            //if the file doesn't start with and is a box template
            if (!(name.indexOf('/_') > -1) && name.startsWith('boxes/')) {
                return {
                    template: templates[name]()
                };
            } else {
                return null;
            }
        });

        var popups = Object.keys(templates).map(function(name) {
            //if the file doesn't start with and is a popup template
            if (!(name.indexOf('/_') > -1) && name.startsWith('popups/')) {
                return {
                    template: templates[name]()
                };
            } else {
                return null;
            }
        });

        // Exposes the templates during view rendering.
        if (boxes.length) {
            res.locals.boxes = boxes;
        }

        if (popups.length) {
            res.locals.popups = popups;
        }

        setImmediate(next);
    }).catch(next);
}

//
//  OBJECTS
//

function Stream(isBasic) {
    this.boxes = [];
    this.users = new Users();

    //TODO: Maybe do this another way. Not sure.
    if (!isBasic){
        this.requestManager = new RequestManager();
    }

    this.usersCanPm = Config.privateMessaging;
}

Stream.prototype.addBoxAndSend = function(boxToAdd) {
    var boxUnique = this.addBox(boxToAdd);
    this.sendBox(boxUnique);
    return boxUnique;
};

Stream.prototype.addBoxById = function(boxId, data) {
    var boxUnique = this.addBox(new BoxObjects[boxId.toLowerCase()](data));
    return boxUnique;
};

Stream.prototype.addBox = function(boxToAdd) {
    //adds the box to the server-side stream
    this.boxes.push(boxToAdd);
    return boxToAdd.unique;
};

Stream.prototype.sendBox = function(uniqueOfBoxToSend, reqMan) {
    var index = this.getBoxIndexByUnique(uniqueOfBoxToSend);

    //if the boxes exists in this stream
    if (index !== -1){
        var boxToSend = this.boxes[index];
        //add the socket listeners to each user's socket
        if (boxToSend.adminStreamOnly){
            Dispatcher.attachAdminListenersToAllUsers(boxToSend, reqMan);
        } else {
            Dispatcher.attachListenersToAllUsers(boxToSend, this);
        }

        //sends the box to everyone
        Dispatcher.sendNewBoxToAll(boxToSend, this.users);
    } else {
        console.log('\x1b[31m%s\x1b[0m', 'Send box failed: Box does not exist in this stream');
    }
};

Stream.prototype.removeBox = function(boxUnique) {
    var index = this.getBoxIndexByUnique(boxUnique);
    if (index > -1) {
        this.boxes.splice(index, 1);
        return true;
    }
    return false;
}

Stream.prototype.clearAll = function() {
    $('#stream').empty();
};

Stream.prototype.listAllBoxes = function() {
    var result = '';
    this.boxes.forEach(function(box) {
        result += box.unique + "\n";
    });
    return result;
};

Stream.prototype.getBoxIndexByUnique = function(boxUnique) {
    for (var i = this.boxes.length - 1; i >= 0; i--) {
        if (this.boxes[i].unique === boxUnique) {
            return i;
        }
    };
    return -1;
}

Stream.prototype.prepNewUser = function(id) {
    var user = this.users.findUser(id)

    //if the user exists in this stream
    if (user !== -1) {
        //send the boxes of the actual stream
        Dispatcher.sendStream(this.boxes, user);

        //add static request listeners for each type of box
        for (var i = BoxNames.length - 1; i >= 0; i--) {
            var box = BoxObjects[BoxNames[i]];
            if (box.addRequestListeners !== undefined){
                box.addRequestListeners(user.socket, this);
            }
        };

        //send the updated user list to all users
        Dispatcher.sendUserListToAll(this.users);
    }
}

Stream.prototype.initializeSteamLogin = function() {

    var self = this;
    var LoginSuccessHandler = function(req, res, stream) {
        //this is ran when the user successfully logs into steam
        var user = req.user;

        var id;
        var secret;
        var username = user.displayName;

        //if user.id exists, this is a Steam user
        var isValidSteamUser;
        if (user.id && user._json) {
          var steamInfo = {
            id: user.id,
            avatar: user._json.avatarfull
          }
          isValidSteamUser = stream.users.findUserBySteamId(steamInfo.id);
        }

        var userAlreadyExists;
        if (isValidSteamUser) {
            userAlreadyExists = stream.users.checkCredentials(isValidSteamUser.id, isValidSteamUser.secret);
        } else {
            userAlreadyExists = false;
        }

        if (userAlreadyExists){
            //reuse the old info
            id = isValidSteamUser.id;
            secret = isValidSteamUser.secret;
        } else {
            //generate the user's id and secret
            id = stream.users.getNextUserId();
            secret = crypto.randomBytes(20).toString('hex');
        }

        //add the user to the stream and await their return
        stream.users.addOrUpdateUserInfo(secret, id, username, steamInfo);

        //set a cookie that allows the user to know its own id
        res.cookie('id', id, {
            maxAge: 604800000 // Expires in one week
        });

        //set a cookie that will act as the user's login token
        res.cookie('secret', secret, {
            maxAge: 604800000 // Expires in one week
        });

        //redirect to the main stream
        res.redirect('/main');
    };

    passport.use(new SteamStrategy({
            returnURL: Config.url + ":" + Config.port + '/auth/steam/return',
            realm: Config.url  + ":" + Config.port + '/',
            apiKey: Config.steamAPIKey
        },
        function(identifier, profile, done) {
            //i don't know what any of this does
            profile.identifier = identifier;
            return done(null, profile);
        }
    ));

    app.get('/auth/steam',
        passport.authenticate('steam'),
        function(req, res) {});

    app.get('/auth/steam/return',
        passport.authenticate('steam', {
            failureRedirect: '/'
        }),
        function(req, res) {
            LoginSuccessHandler(req, res, self);
        });


    //fake steam login for development purposes
    //if developer mode is enabled
    if (Config.developerMode) {
        app.get('/devlogin', function(req, res) {
            // url:port/devlogin?username=NAMEHERE
            req.user = {
                displayName: req.query.username
            };
            LoginSuccessHandler(req, res, self);
        });
    }

    app.get('/login', (req, res) => {
    const code = req.query.code;
    if (!code) return res.send('Add meg a kódot!');

    const username = getUsernameByCode(code);
    if (!username) return res.send('Login failed: invalid code');

    req.user = { displayName: username };
    LoginSuccessHandler(req, res, mainStream);
});
    //pretty sure this is useless
    app.get('/logout', function(req, res) {
        req.logout();
        res.redirect('/');
    });

};

Stream.prototype.initializePrivateMessaging = function(socket) {
  var self = this;
  Box.addStaticEventListener('message', socket, this, function(user, data) {
    //check if pm has been enabled or disabled from the console
    if (self.usersCanPm) {
      self.sendMessage(data.message, data.userToReceiveMessage.id, user.id, self);
    }
  });
}

Stream.prototype.sendMessage = function(message, idOfUserToReceiveMessage, idOfUserWhoSentMessage) {
  var userToReceiveMessage = this.users.findUser(idOfUserToReceiveMessage);
  var userWhoSentMessage = this.users.findUser(idOfUserWhoSentMessage);
  if (userToReceiveMessage && userToReceiveMessage.canReceivePMs) {
    userToReceiveMessage.socket.emit('message', {
      userWhoSentMessage: userWhoSentMessage.toStrippedJson(),
      message: message
    })
  }
}

Stream.prototype.enablePrivateMessaging = function() {
  this.users.list.forEach(function(user) {
    user.canReceivePMs = true;
  })

  this.usersCanPm = true;

  //clients use the user list to determine if they can pm another user
  Dispatcher.sendUserListToAll(this.users);
}

Stream.prototype.disablePrivateMessaging = function() {
  this.users.list.forEach(function(user) {
    user.canReceivePMs = false;
  })

  this.usersCanPm = false;

  //clients use the user list to determine if they can pm another user
  Dispatcher.sendUserListToAll(this.users);
}



function Users() {
    this.list = [];
    this.loginCodes = [];

    //rough user count, used for ids
    this.userCount = 0;
}

Users.prototype.addOrUpdateUserInfo = function(secret, id, username, steamInfo) {
    //if this user already exists
    var element = this.checkCredentials(id, secret);
    if (element) {
        //update their info
        element.username = username;
        element.steamInfo = steamInfo;

        //should already be null, just precautionary
        element.socket = null;
        return element;
    }

    //ran if the user does not already exist
    var tempUser = new User(id, secret, username, steamInfo);
    this.list.push(tempUser);
    return tempUser;
}

Users.prototype.connectUser = function(id, secret, socket) {
    var user = this.checkCredentials(id, secret);
    if (user) {
        //user found and verified, update their info.
        user.socket = socket;
        return user;
    }

    //user not found
    return false;
}

Users.prototype.findUser = function(id) {
  for (element of this.list) {
      if (element.id === parseInt(id)) {
          return element;
      }
  }
  return false;
}

Users.prototype.findUserBySteamId = function(steamId) {
  for (element of this.list) {
      if (element.steamInfo && element.steamInfo.id === steamId) {
          return element;
      }
  }
  return false;
}

Users.prototype.checkCredentials = function(id, secret) {
  var user = this.findUser(id);
  //if the user exists and the secret is correct
  if (user && element.secret === secret) {
    return user;
  }

  //otherwise
  return false;
}

Users.prototype.checkIfUserIsOP = function(id) {
    var user = this.findUser(id);
    if (user){
      return user.isOp;
    }
    return false;
}

Users.prototype.removeUser = function(userToRemove) {
    var indexToRemove = this.list.indexOf(userToRemove);
    if (indexToRemove > -1) {
        this.list.splice(indexToRemove, 1);
    }
}

Users.prototype.getAllUsers = function() {
  return this.list;
}

Users.prototype.getAllUsersStripped = function() {
  var tempList = [];
  this.list.forEach(function(user) {
    tempList.push(user.toStrippedJson());
  });
  return tempList;
}

Users.prototype.getOnlineUsers = function() {
    var result = [];
    this.list.forEach(function(user) {
        if (user.isOnline()) {
            result.push(user);
        }
    });
    return result;
}

Users.prototype.getOnlineOppedUsers = function() {
    var result = [];
    this.list.forEach(function(user) {
        if (user.isOnline() && user.isOP) {
            result.push(user);
        }
    });
    return result;
}

Users.prototype.generatecode = function(username) {
    if (!username || typeof username !== 'string' || username.trim() === '') {
       console.log('\x1b[33m%s\x1b[0m', '[Info]The username is incorrect or missing.'); // sárga szín

        return null;
    }

    // hossz beállítása
    const codeLength = 5;
    const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZ123457890";

    function makeid() {
        let text = "";
        for (let i = 0; i < codeLength; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }

    // generáljunk egyedi kódot, ami még nincs használatban
    let code;
    do {
        code = makeid();
    } while (codes.hasOwnProperty(code));

    // hozzáadjuk a codes.js rendszerhez és elmentjük a JSON fájlba
    addCode(code, username);

   console.log('\x1b[36m%s\x1b[0m', `[Info] New code created: ${code} -> ${username}`); // cián szín

    return code;
}

Users.prototype.loginUsingCode = function(code) {
    var index = this.loginCodeIndex(code);
    if (index !== -1) {
        //remove the code from the array
        //  so it cannot be used twice
        this.loginCodes.splice(index, 1);

        //login validated
        return true;
    }
    //code doesn't match
    return false;
}

Users.prototype.loginCodeIndex = function(code) {
    for (var i = this.loginCodes.length - 1; i >= 0; i--) {
        if (this.loginCodes[i] === code) {
            return i;
        }
    };
    return -1;
}

Users.prototype.getNextUserId = function() {
  this.userCount++;
  return this.userCount;
}



function User(id, secret, username, steamInfo) {
    this.socket = null;
    this.isOp = false;

    this.id = id;
    this.secret = secret;
    this.username = username;
    this.steamInfo = steamInfo;
    this.canReceivePMs = Config.privateMessaging;
}

User.prototype.isOnline = function() {
    return this.socket !== null;
}

User.prototype.op = function() {
    this.isOp = true;
}

User.prototype.deop = function() {
    this.isOp = false;
}

User.prototype.toStrippedJson = function() {
  //recreate user object to prevent maximum call stack size error
  //	and to remove the secret from the user objects, to prevent
  //	it from being sent to everyone, posing a security risk
  return {
    id: this.id,
    username: this.username,
    steamInfo: this.steamInfo,
    isOp: this.isOp,
    canReceivePMs: this.canReceivePMs
  }
}



function Console() {}

Console.addListeners = function(stream) {
    var stdin = process.openStdin();
    stdin.addListener("data", function(d) {
        //string of what was entered into the console
        var line = d.toString().trim();

        //automatic add commands
        if (line.toLowerCase().startsWith('add ')) {
            var lineArr = line.split(' ');
            var boxName = lineArr[1].toLowerCase();
            if (boxName in BoxObjects && !BoxObjects[boxName].excludeFromConsole) {
                var lengthBeforeData = lineArr[0].length + lineArr[1].length + 2;
                var data = {
                    isConsole: true,
                    line: line.substr(lengthBeforeData, line.length)
                }
                stream.addBoxAndSend(new BoxObjects[boxName](data));
            }
        }
    else if (line.toLowerCase().startsWith('op ')) {
        var lineArr = line.split(' ');
        var code = lineArr[1].trim().toUpperCase();

        const username = getUsernameByCode(code);

        if (!username) {
          console.log('\x1b[31m%s\x1b[0m', `[Error] Incorrect code: ${code}`); 
            return;
        }

        let userToOp = stream.users.list.find(u => u.username.toLowerCase() === username.toLowerCase() ||
                                                (u.steamInfo && u.username.toLowerCase() === username.toLowerCase()));

        if (userToOp) {
            userToOp.op();
            Dispatcher.sendUserListToAll(stream.users);
            console.log('\x1b[36m%s\x1b[0m', `[Info] ${userToOp.username} OP status is turned on for ${code}.`); 
        } else {
           console.log('\x1b[31m%s\x1b[0m', `[Error] Username isnt found: ${username} (code: ${code})`); 
        }
    } 
    else if (line.toLowerCase().startsWith('deop ')) {
        var lineArr = line.split(' ');
        var code = lineArr[1].trim().toUpperCase();

        const username = getUsernameByCode(code);

        if (!username) {
           console.log('\x1b[31m%s\x1b[0m', `[Error] Invalid or non-existent code: ${code}`);
            return;
        }

        let userToDeop = stream.users.list.find(u => u.username.toLowerCase() === username.toLowerCase() ||
                                                    (u.steamInfo && u.username.toLowerCase() === username.toLowerCase()));

        if (userToDeop) {
            userToDeop.deop();
            Dispatcher.sendUserListToAll(stream.users);
           console.log('\x1b[36m%s\x1b[0m', `[Info] ${userToDeop.username} OP status revoked (code: ${code}).`);
        } else {
            console.log('\x1b[31m%s\x1b[0m', `[Error] User not found: ${username} (code: ${code})`);
        }
    }


        //static commands
        else if (line.toLowerCase() === "help") {
          console.log('');
          console.log('Lansite Command List:');
          console.log('');

          var commandList = [];

          //add commands
          BoxNames.forEach(function(boxName) {
            if (!BoxObjects[boxName].excludeFromConsole) {
              commandList.push('add ' + boxName);
            }
          });

          commandList.push('help');
          commandList.push('stop');
          commandList.push('yt [play[url] | stop]');
          commandList.push('clockmode [ON | OFF]');
          commandList.push('generatecode [userename]');
          commandList.push('op [code/ userid here]');
          commandList.push('deop [code/ userid here]');

          commandList.sort();

          commandList.forEach(function(cmd) {
            console.log(cmd);
          });
          console.log('');
          console.log('Check the readme for more information on the function of each command.');
          console.log('');

        }
        else if (line.toLowerCase().startsWith("view ")) {
          var cmd = line.substring(5).toLowerCase();
          if (cmd === "codes") {
              console.log(stream.users.loginCodes);
          } else if (cmd === "users") {
              console.log(stream.users.getAllUsersStripped());
          } else if (cmd === "boxes") {
              console.log(stream.listAllBoxes());
          } else if (cmd === "requests") {
              console.log(stream.requestManager.getRequests());
          } else {
            console.log('\x1b[33m%s\x1b[0m', 'Invalid view command. Type "help" for a list of commands.');
          }
        }
        else if (line.toLowerCase() === "stop") {
            process.exit();
        }  
        else if (line.toLowerCase().startsWith("yt ")) {
            const args = line.trim().split(" ");
            const cmd = args[1];
            const url = args[2];

            if (cmd === "play" && url) {
                io.emit("yt", { action: "play", url: url });
                console.log("YT play:", url);
            } else if (cmd === "stop") {
                io.emit("yt", { action: "stop" });
                console.log("YT stop");
            } else {
                console.log('Használat: yt play [url] | yt stop');
            }
        }
        else if (line.toLowerCase().startsWith("clockmode ")) {
            const args = line.trim().split(" ");
            const state = args[1] ? args[1].toLowerCase() : null;

            if (state === "on") {
                clockMode = true;
                console.log("Clockmode bekapcsolva (ON)");
            } else if (state === "off") {
                clockMode = false;
                console.log("Clockmode kikapcsolva (OFF)");
            } else {
                console.log("Használat: clockmode [on|off]");
            }
        }
        else if (line.toLowerCase().startsWith("generatecode ")) {
            const username = line.substring("generatecode ".length).trim();
            if (!username) {
                console.log('\x1b[31m[Error] Hibás vagy hiányzó username.\x1b[0m');
                return;
            }

            const codeLength = 5;
            const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

            function makeid() {
                let text = "";
                for (let i = 0; i < codeLength; i++) {
                    text += possible.charAt(Math.floor(Math.random() * possible.length));
                }
                return text;
            }

            let code;
            do {
                code = makeid();
            } while (codes.hasOwnProperty(code));

            addCode(code, username); 

            try {
                delete require.cache[require.resolve('./codes')];
                global.codes = require('./codes').codes;
                console.log('\x1b[36m%s\x1b[0m', '[Info] codes.json reloaded.');
            } catch (err) {
                console.error('\x1b[31m%s\x1b[0m', '[Error] Failed to reload codes.json:', err);
            }

            console.log(`\x1b[32m[Info]\x1b[0m New code created: \x1b[36m${code}\x1b[0m -> \x1b[33m${username}\x1b[0m`);
        }
        else if (line.toLowerCase() === "view codes") {
                console.log("Current reusable codes:");
                Object.keys(codes).forEach(code => {
                    console.log(`${code} -> ${codes[code]}`);
                });
            }

            else if (line.toLowerCase().startsWith('pm ')) {
                if (line.toLowerCase() === 'pm on') {
                stream.enablePrivateMessaging();
                } else if (line.toLowerCase() === 'pm off'){
                stream.disablePrivateMessaging();
                }
            }
            else {
            console.log('');
            console.log('Invalid command. Type "help" for a list of commands.');
            console.log('');
            }
    });
}



function RequestManager() {
    this.requestList = [];
    this.adminStream = new Stream(true);
    this.adminStream.addBox(new BoxObjects['textbox']({
        text: 'User requests will appear on this page, and you will be able to accept or deny them. Please note,'
        + ' users can only have one request open at once, and if they make a new request, their old request will be replaced.',
        title: 'Welcome to the Admin Stream'
    }));
}

RequestManager.prototype.addRequest = function(userThatMadeRequest, requestString, acceptFunction, denyFunction){
    //if the user is op, accept the request, no questions asked
    if (userThatMadeRequest.isOp) {
        //I bypass adding the request and using the handler here
        //  the true tells the function to supress the usual popup
        //  that users receive when their popup is accepted
        acceptFunction(true);
        return;
    }

    //since users can only have one request open at a time
    //check to see if they have a request open already
    var prevReq = this.userHasOpenRequest(userThatMadeRequest.id);
    if (prevReq) {
        //deny their open request
        this.handleRequest(prevReq, false);
    }

    //create a request box on the admin stream
    var boxsUnique = this.adminStream.addBox(new BoxObjects['requestbox']({
        text: userThatMadeRequest.username + ' ' + requestString,
    }));
    this.adminStream.sendBox(boxsUnique, this);

    //then we create the request in this manager
    this.requestList.push(new Request(userThatMadeRequest, requestString, boxsUnique, acceptFunction, denyFunction));
}

RequestManager.prototype.getRequests = function(){
    return this.requestList;
}

RequestManager.prototype.handleRequest = function(requestUnique, wasAccepted){
    var request = this.getRequestIfExists(requestUnique);
    if (request !== null) {
        if (wasAccepted){
            request.acceptRequest();
        } else {
            request.denyRequest();
        }
    this.removeRequest(requestUnique);
    };
}

RequestManager.prototype.removeRequest = function(requestUnique){
    var requestIndex = this.getIndexByUnique(requestUnique);
    //if request exists
    if (requestIndex !== -1) {
        //remove the request from the array
        this.requestList.splice(requestIndex, 1);
        //remove this box since we're done with it
        this.adminStream.removeBox(requestUnique);
        //send the new adminStream with removed box
        Dispatcher.sendStreamToAll(this.adminStream.boxes, this.adminStream.users);
        return true;
    } else {
        return false;
    };
}

RequestManager.prototype.getRequestIfExists = function(requestUnique) {
    var requestIndex = this.getIndexByUnique(requestUnique);

    //if request exists
    if (requestIndex !== -1) {
        return this.requestList[requestIndex];
    } else {
        return null;
    };

}

RequestManager.prototype.getIndexByUnique = function(requestUnique) {
    for (var i = this.requestList.length - 1; i >= 0; i--) {
        if (this.requestList[i].unique === requestUnique) {
            return i;
        };
    };
    return -1;
}

RequestManager.prototype.userHasOpenRequest = function(id) {
    for (var i = this.requestList.length - 1; i >= 0; i--) {
        if (this.requestList[i].user.id === id) {
            return this.requestList[i].unique;
        };
    };
    return false;
}



function Request(userThatMadeRequest, requestString, boxsUnique, acceptFunction, denyFunction) {
    this.unique = boxsUnique;

    this.requestText = requestString.trim();
    this.user = userThatMadeRequest;
    this.acceptFunction = acceptFunction;
    this.denyFunction = denyFunction;

    this.boxsUnique = boxsUnique;
}

Request.prototype.acceptRequest = function(supressPopup){
    this.acceptFunction(this.user);

    //notify the user that their request was accepted if this
    //  is not an admin's automatically accepted request
    if (!supressPopup) {
        this.user.socket.emit('requestAccepted', this.user.username + ' ' + this.requestText);
    }
}

Request.prototype.denyRequest = function(){
    this.denyFunction(this.user);

    //notify the user that their request was denied
    this.user.socket.emit('requestDenied', this.user.username + ' ' + this.requestText);
}



//
//  MAIN CODE
//

var mainStream = new Stream(false);
mainStream.addBox(new BoxObjects['matchbox']());
mainStream.addBox(new BoxObjects['eventbox']());
Console.addListeners(mainStream);
mainStream.initializeSteamLogin();

if (Config.privateMessaging) {
  mainStream.enablePrivateMessaging();
} else {
  mainStream.disablePrivateMessaging();
}

//handles users coming and going
io.on('connection', function(socket) {

    //sent by client if it detects it has a valid token in it's cookies
    socket.on('login', function(msg) {
        var user = mainStream.users.connectUser(msg.id, msg.secret, socket);

        if (user) {
            console.log('\x1b[32m%s\x1b[0m', 'User successfully validated');

            //check to see if we should set the user to OP
            if (Config.autoOPFirstUser && mainStream.users.list.length === 1) {
                user.op();
            }

            mainStream.initializePrivateMessaging(socket);

            mainStream.prepNewUser(user.id);

            //add the socket listeners to the user for all of the current boxes
            for (var i = mainStream.boxes.length - 1; i >= 0; i--) {
                Dispatcher.attachListenersToUser(user, mainStream.boxes[i], mainStream);
            };

            socket.on('disconnect', function() {
                console.log(user.username + ' disconnected');
                user.socket = null;
                //mainStream.users.removeUser(user);

                //send the updated user list to all users
                Dispatcher.sendUserListToAll(mainStream.users);
            });

        } else {
            console.log('\x1b[31m%s\x1b[0m', 'User validation unsuccessful');

            //send them back to the homepage to try again
            socket.emit('failed');
        }
    });

    socket.on('adminStreamLogin', function(msg) {
        //check to see if the user exists in the main stream and is admin
        var user = mainStream.users.checkCredentials(msg.id, msg.secret);
        if (user.isOp){
            console.log(user.username + ' has logged in as admin');
            var adminStream = mainStream.requestManager.adminStream;

            var adminUser = adminStream.users.addOrUpdateUserInfo(user.secret, user.id, user.displayName, user.steamId);
            adminUser = adminStream.users.connectUser(adminUser.id, adminUser.secret, socket);
            adminStream.prepNewUser(adminUser.id);

            //add the socket listeners to the user for all of the current boxes
            for (var i = adminStream.boxes.length - 1; i >= 0; i--) {
                Dispatcher.attachAdminListenersToUser(adminUser, adminStream.boxes[i], mainStream.requestManager);
            };

        } else {
            console.log(user.username + ' failed to log in as admin');
        }


    });

    socket.on('areWeOP', function(msg) {
        if (mainStream.users.checkIfUserIsOP(msg.id)){
            socket.emit('areWeOP', true);
        } else {
            socket.emit('areWeOP', false);
        }
    });

    socket.on('disconnect', function() {
        //console.log('Unauthenticated user disconnected');
        //mainStream.users.removeUser(user);
    });
});

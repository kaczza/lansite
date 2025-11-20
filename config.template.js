//
//  Lansite Config
//  By Kacza
//

var Config = {};

//Web Address: Specify the URL that the server will append to redirects
Config.url = 'localhost';

//Port: Specify the port in which the server will run off
Config.port = 3000;

//Offline Mode: For LANs that have no Internet
Config.offlineMode = false;

//Steam API Key: Grab one for yourself here: http://steamcommunity.com/dev/apikey
Config.steamAPIKey = 'YOUR STEAM API HERE';

//If its true then you'll have to generate a code for each person. If its off you can log in with steam
Config.LoginWithCode = false;

//Auto OP First User: Make the first user that logs into Lansite an admin
Config.autoOPFirstUser = true;

//Developer Mode: Enables features that are insecure to run in a production situation
Config.developerMode = false;

//Private Messaging: enable or disable private messaging between users
Config.privateMessaging = true;

//If its true then The admin have to verfy every request(EX.: creating a vote or something like that)
Config.requireAdminVerification = true;

//if true you can op by username instead of only steam id
Config.OpByCode = true

module.exports = Config;
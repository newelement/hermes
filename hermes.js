var express      = require('express');
var bodyParser   = require('body-parser');
var http         = require('http');
var socketIo     = require('socket.io');
var socketio_jwt = require('socketio-jwt');
var cors         = require('cors');
var crypto       = require('crypto');
var jwt          = require('jsonwebtoken');
var unirest      = require('unirest');


// Hash
var hrTime = process.hrtime()
var microtime = hrTime[0] * 1000000 + hrTime[1] / 1000;
var salt = 'SDAF34$@%%fdf34$3234&!!fdk00912ljsadjfvmASDFcasdakjedwer324rsdf!!&&****%$sdcsc@#3sfdlkfdsfsdf'+microtime;
var hash = crypto.createHash('md5').update(salt).digest('hex');
var jwt_secret = hash;

// Basic login auth. You can change it to auth with something else if you like.
var authUser = 'hermes';
var authPass = 'messengergod007';

// Local data storage. Push clients into the array.
var client_data = { clients : [] };

// Express stuff
var app = express();
app.use( bodyParser.json() );
app.use( bodyParser.urlencoded({ extended: true }) );
app.use( express.static(__dirname + '/') );
app.use( cors() );

// Login route to handle authentication. Returns jwt token.
app.post('/login', function (req, res) {
  
    var profile = {
        project: 'Hermes',
        id: microtime
    };
  
    var username = req.body.username;
    var password = req.body.password;
  
    if( typeof username === 'undefined' || typeof password === 'undefined' ){
        res.status(401).send('Unauthorized');
        return;
    }
  
    // Send login request optional. Coming soonish.
    if( !username.length || !password.length ){
        res.status(401).send('Unauthorized');
        return;
    } else {
      
         
        // API auth - Authenticate with your API
        unirest.post('https://api.walkerfirst.com/v1/Bf65GHop3WEssdf56z/json/auth/login')
        .headers({ 'Accept': 'application/json' })
        .type('json')
        .send( { "username" : username, "password" : password } )
        .end(function (response) {
            var api_status = (response.body.api_status);
            
            if( api_status === 'success' ){
                
                var token = jwt.sign(profile, jwt_secret, { expiresInMinutes: 60*10 });
                res.json({token: token});
                
            }  else {
                
                res.status(401).send('Unauthorized');
                return;
                
            }
                
        });
        
        // Basic auth - Authenticate with local username and password vars
        /*
        if( ( username === authUser ) && ( password === authPass ) ){
          
            // We are sending the profile inside the token
            var token = jwt.sign(profile, jwt_secret, { expiresInMinutes: 60*10 });
            res.json({token: token});
            
            
        } else {
            
            res.status(401).send('Unauthorized');
            return;
            
        }*/
    
    }

});


function extend(target) {
    var sources = [].slice.call(arguments, 1);
    sources.forEach(function (source) {
        for (var prop in source) {
            target[prop] = source[prop];
        }
    });
    return target;
}

function Merge(obj1, obj2) {
  for (var p in obj2) {
    try {
      if ( obj2[p].constructor==Object ) {
        obj1[p] = Merge(obj1[p], obj2[p]);
      } else {
        obj1[p] = obj2[p];
      }
    } catch(e) {
      obj1[p] = obj2[p];
    }
  }
  return obj1;
}


// Create the server
var server = http.createServer(app);
var sio = socketIo.listen(server);

// Use the auth token for socket.io
sio.use(socketio_jwt.authorize({
  secret: jwt_secret,
  handshake: true
}));


sio.sockets.on('connection', function (socket) {
    
    // The app namespace
    var nsp = sio.of(socket.nsp.name);
    
    // App space is used to isolate trafic between apps using the messenger service.
    var appSpace = 'default';
    
    console.info('New client connected (id=' + socket.id + ').');
  
    // Add clients to the clients object for future use
    client_data.clients.push( { id : socket.id } );
    

    // Adds client data from the client
    socket.on('init', function ( clientObj ) {
    
        if( typeof clientObj !== 'undefined' || clientObj !== null ){
      
            if( (typeof clientObj === 'object') || (typeof clientObj == 'string' || clientObj instanceof String) ){
                
                // If something like PHP submits the object sometimes it's seen as a string.
                if( typeof clientObj == 'string' || clientObj instanceof String ){
                    clientObj = JSON.parse(clientObj);
                }
                
                var newObj = client_data.clients.filter(function( obj ) {
                    if(obj.id === socket.id){
                        obj = Merge(obj, clientObj);
                        return obj;
                    }
                });
      
                client_data.clients = client_data.clients.filter(function( objj ) {
                    return objj.id !== socket.id;
                });
                
                // Save the connected client to the data object
                client_data.clients.push( newObj[0] );
            
                // Send the session id to the connected user for future use
                var cObj = { client_id : socket.id };
                sendObj = obj2 = extend({}, cObj, client_data);
                sio.sockets.connected[socket.id].emit('client_init', sendObj );
                //nsp.to(socket.id).emit( 'client_init', sendObj );
              
                // Broadcast to all clients that a client connected
                var connClientObj = client_data.clients.filter(function( obj ) {
                    return obj.id === socket.id;
                });
        
                // Join the app space
                appSpace = (clientObj.app_space)? clientObj.app_space : 'default' ;
                socket.join(appSpace);
                
                if( appSpace === "default" ){ 
                    //nsp.emit('client_connected', connClientObj[0]);
                    socket.broadcast.emit('client_connected', connClientObj[0]);
                } else {
                    socket.in(appSpace).emit('client_connected', connClientObj[0]);
                }
        
            } // END if
    
        } // END if
  
    }); // END socket.on init 
  


    // Relay messages from the sender to all other clients
    socket.on('messenger', function ( obj ) {
      
        if( typeof obj == 'string' || obj instanceof String ){
            obj = JSON.parse(obj);
        }
        
        var fromData = client_data.clients.filter(function( objj ) {
            return objj.id === socket.id;
        });
        
        var fromObj = { from : fromData[0] };
        
        obj2 = extend({}, obj, fromObj);
      
        // This sends to everyone including the sender
        //io.emit('message', msg);
        // This sends to everyone but the sender
        if( appSpace === "default" ){
            socket.broadcast.emit('messenger', obj2);
        } else {
            socket.in(appSpace).emit('messenger', obj2);
        }
    
    });
  
  
  
    // Send message object to one specific client
    socket.on('messenger_to', function ( obj ) {
      
        if( typeof obj == 'string' || obj instanceof String ){
            obj = JSON.parse(obj);
        }
      
        id = obj.to;
        
        var fromData = client_data.clients.filter(function( objj ) {
            return objj.id === socket.id;
        });
        
        var fromObj = { from : fromData[0] };
        obj2 = extend({}, obj, fromObj);
      
        // Check if exists
        if( sio.sockets.connected[id] !== undefined ){
      
            sio.sockets.connected[id].emit('messenger', obj2);
      
        }
    
    });
  
  
  
    // Send message object to one specific client by OPRID
    socket.on('messenger_to_oprid', function ( obj ) {
      
        if( typeof obj == 'string' || obj instanceof String ){
            obj = JSON.parse(obj);
        }
      
        var getClient = client_data.clients.filter(function( objj ) {
            return objj.oprid.toUpperCase() === obj.oprid.toUpperCase();
        });
      
        var clientObj = getClient[0];
      
        if( sio.sockets.connected[clientObj.id] !== undefined ){
      
            sio.sockets.connected[clientObj.id].emit('messenger', obj);
      
        }
    
    });

  
    // Client disconnection actions
    socket.on('disconnect', function () {
        
        var dis = client_data.clients.filter(function( obj ) {
            return obj.id === socket.id;
        });
        
        client_data.clients = client_data.clients.filter(function( objj ) {
            return objj.id !== socket.id;
        });
        
        if( appSpace === "default" ){
            socket.broadcast.emit('client_disconnected', dis[0] );
        } else {
            socket.in(appSpace).emit('client_disconnected', dis[0] );
        }
        
        console.info('Client disconnected (id=' + socket.id + ').');
        
    });

    
    socket.on('error', function () {      
        // log error somewhere
    });
    
}); // END on connection
  

// Start the server
server.listen(80, function () {
  console.log('Hermes server started.');
});
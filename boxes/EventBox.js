//
//  Lansite Server EventBox 
//  By Kacza
//

const crypto = require('crypto');
const Box = require('./shared/Box');
const Dispatcher = require('./shared/Dispatcher');

EventBox.prototype = Object.create(Box.prototype);

function EventBox(data) {
    Box.call(this);
    this.id = EventBox.id;
    this.events = [];
}

EventBox.id = "EventBox";

EventBox.prototype.addResponseListeners = function(socket, stream) {
    Box.prototype.addResponseListeners.call(this, socket, stream);

    const self = this;

    // User joins an event
    this.addEventListener('join', socket, stream, function(user, data) {
        const event = self.getEventByUnique(data.eventUnique);
        const checkUser = event.checkIfUserInEvent(user.id);

        if (event !== null && !checkUser) {
            event.addUser(user.toStrippedJson());
        }

        Dispatcher.sendUpdatedBoxToAll(self, stream.users);
    });

    // User leaves an event
    this.addEventListener('leave', socket, stream, function(user, data) {
        const event = self.getEventByUnique(data.eventUnique);
        const userToRemove = event.checkIfUserInEvent(user.id);

        if (event !== null && userToRemove !== null) {
            event.removeUser(userToRemove);
        }

        Dispatcher.sendUpdatedBoxToAll(self, stream.users);
    });

    // OP/Admin creates a new event
    this.addRequestListener('newevent', socket, stream, function(user, data) {
        if (self.adminOnly && !user.isOp) {
            socket.emit('errorMessage', { message: 'You do not have permission to create events!' });
            return;
        }

        const title = data.title;
        const maxParticipants = parseInt(data.maxParticipants);

        stream.requestManager.addRequest(user, `wants to create an event: ${title}`, function() {
            self.addEvent(title, user.toStrippedJson(), maxParticipants);
            Dispatcher.sendUpdatedBoxToAll(self, stream.users);
        }, function() {});
    });
};

// Add event to the box
EventBox.prototype.addEvent = function(title, host, maxParticipants) {
    const validMax = maxParticipants >= 0;

    if (validMax) {
        this.events.push(new Event(title, host, maxParticipants));
    } else {
        console.log('Failed to add event');
    }
};

// Remove event from the box
EventBox.prototype.removeEvent = function(event) {
    const index = this.events.indexOf(event);
    if (index > -1) {
        this.events.splice(index, 1);
    } else {
        console.log('Failed to remove event');
    }
};

// Find event by unique ID
EventBox.prototype.getEventByUnique = function(eventUnique) {
    for (let i = this.events.length - 1; i >= 0; i--) {
        if (this.events[i].unique === eventUnique) {
            return this.events[i];
        }
    }
    return null;
};

EventBox.addRequestListeners = function(socket, stream) {};

function Event(title, host, maxParticipants) {
    this.unique = crypto.randomBytes(20).toString('hex');
    this.title = title;
    this.host = host;
    this.max = parseInt(maxParticipants);
    this.users = [];

    // Automatically add host
    this.users.push(this.host);
}

// Check if user is already in the event
Event.prototype.checkIfUserInEvent = function(userId) {
    for (let i = this.users.length - 1; i >= 0; i--) {
        if (this.users[i].id === parseInt(userId)) {
            return this.users[i];
        }
    }
    return false;
};

// Add user to the event
Event.prototype.addUser = function(userToAdd) {
    const user = this.checkIfUserInEvent(userToAdd.id);

    let notFull = true;
    if (this.max !== 0) {
        notFull = this.users.length < this.max;
    }

    if (!user && notFull) {
        this.users.push(userToAdd);
    }
};

// Remove user from the event
Event.prototype.removeUser = function(userToRemove) {
    const user = this.checkIfUserInEvent(userToRemove.id);

    if (user) {
        const index = this.users.indexOf(userToRemove);
        if (index > -1) {
            this.users.splice(index, 1);
        } else {
            console.log('Failed to remove user from event');
        }
    } else {
        console.log('Failed to remove user from event');
    }
};

module.exports = EventBox;

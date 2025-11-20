# Lansite

**Lansite** is a simple, centralized web application designed for small LAN parties. It serves as an information hub for all attendees.

<p align="center">
  <img src="https://iili.io/f2jN3dX.th.png" width="1912"/>
</p>

---

## Features

### For Attendees
- Login via Steam accounts; no registration required  
- Read messages, vote in polls, and find people to play games with  
- Access other attendees' Steam profiles via the sidebar  
- Submit message or poll requests with a single button  

### For Admins
- Easy installation, configuration, and launch  
- Approve or deny attendee requests through the Admin Stream  
- Add messages or votes from the sidebar  
- Create login codes for attendees without Steam accounts  

### For Programmers
- Front-end: JavaScript + Bootstrap  
- Back-end: Node.js, Express, Socket.io, Handlebars, Passport  
- Fully modular plugin system (“Boxes”) for easy custom extensions
- Premade themes

---

## Disadvantages

To simplify setup, Lansite **does not use a database**.  
This means all data—users, boxes, messages—is lost when the server stops.

Lansite is designed for **on-site LAN use only**, not long-term event planning.  

### Alternatives
If you need more robust event management software, consider:

- [Lanager](https://github.com/zeropingheroes/lanager)  
- [LANREG](https://www.lanreg.org/)  
- [LanHUB](https://lanhub.net/)  

---

## Installation

### Prerequisites
- [Node.js](https://nodejs.org/)

### Instructions
1. Clone the repository: <https://help.github.com/articles/cloning-a-repository/>  
2. Open CMD/Terminal/Bash inside the Lansite directory  
3. Run: `npm install`  
4. Copy `config.template.js` to `config.js`  
5. Modify the settings in `config.js`  
6. Start the server with: `npm start`  
7. Visit `localhost:PORT` in your browser  

---

## Configuration Options

- **Web Address (string):** URL used for redirect handling  
- **Port (int):** Port the server runs on  
- **Developer Mode (boolean):**  
  - Allows non-Steam login for testing  
  - Shows additional console messages  
- **Steam API Key (string):** Required for Steam authentication  
- **Auto OP First User (boolean):** Makes the first logged-in user an admin  
- Toggle the login-by-code option on/off  
- Choose whether OP can be granted using codes or Steam IDs  
- Toggle AdminVerification mode  

---

## Server Console Commands

- `help` — Show command list  
- `stop` — Stop the server (all data will be deleted)  
- `add matchbox`  
- `add textbox [title];[HTML/text]`  
- `add votebox [question];[choice1];[choice2];...`  
- `generatecode [username]` — Generate a login code  
- `clockmode [ON | OFF]` — Show a clock-only page  
- `op [user id]` — Grant admin privileges  
- `deop [user id]` — Remove admin privileges  
- `pm [on/off]` — Enable/disable private messaging  
- `view boxes` — List all boxes  
- `view codes` — List active login codes  
- `view requests` — Show open requests  
- `view users` — Show user list  

---

## Included Boxes

- **VoteBox:** Create polls (games, food, etc.)  
- **TextBox:** Quick global announcements  
- **MatchBox:** Allow players to list games they want to play  
- **Connect4Box:** Simple matchmaking system for an online Connect 4 game  

---

## Creating Custom Boxes

1. Choose a name (e.g., `FooBox`)  
2. Copy `templates/_TemplateBox.handlebars` → `FooBox.handlebars`  
3. Replace all occurrences of `TemplateBox` inside the file  
4. Copy `public/js/boxes/_TemplateBox.js` → `FooBox.js`  
5. Follow the in-file setup instructions and add your logic  
6. Copy `boxes/_TemplateBox.js` → `FooBox.js` for server-side logic  
7. Add your server-side implementation  

---

## Themes

- Blue
- Black&White
- DarkBlue&Green
- Magenta
- Orange
- Red
  

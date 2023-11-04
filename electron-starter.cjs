// electron-starter.cjs
const { app, BrowserWindow } = require('electron');

let mainWindow;

const { Menu, MenuItem } = require('electron');


async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 600,
    height: 940,
    icon: __dirname + '/build/icons/logo-big-2.png',
    resizable: false,
    webPreferences: {
      nodeIntegration: true,
      // You might also need to enable contextIsolation and other security features
      // Enable the DevTools.
      devTools: true
    },
    // Hide all menu options in the window for all builds
    autoHideMenuBar: true,
  });

  // Remove the application menu
  Menu.setApplicationMenu(null);

  // Show devtools on right click
  const contextMenu = new Menu();
  contextMenu.append(new MenuItem({
    label: 'Debug',
    click: () => {
      mainWindow.webContents.openDevTools();
    }
  }));

  
  mainWindow.webContents.on('context-menu', (e, params) => {
    console.log("Context menu event triggered"); // This line is just for debugging purposes.
    contextMenu.popup(mainWindow);
  });
  


  if (!app.isPackaged) {
    mainWindow.loadURL('http://localhost:5173'); // Your Vite dev server
  } else {
    // Dynamically import your compiled script using import()
    // Assuming that the script has default export as a function to call
    const path = require('path');
    const url = `file://${path.join(__dirname, 'build/index.html')}`;
    mainWindow.loadURL(url);
  }
}

app.whenReady().then(createWindow);

// Handle window-all-closed event
app.on('window-all-closed', () => {
 // if (process.platform !== 'darwin') {
    app.quit();
 // }
});

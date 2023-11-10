import jpegsaverLogo from './assets/logo-big-2.webp'
import ipfsConfigScreen from './assets/ipfs-config-screen.png'
import './App.css'

import React, { useState, useEffect } from 'react';
import Modal from 'react-modal';
import { Buffer } from 'buffer';

import ProgressBar from './components/ProgressBar';

function getOptions(params, method) {


  const options = {
  method: 'POST',
  headers: {
      'Content-Type': 'application/json; charset=UTF-8',
      Accept: 'application/json, text/javascript',
      Authorization: 'Basic ' + Buffer.from("rpc:rpc").toString('base64'),
  },
  body: JSON.stringify({
      jsonrpc: '2.0',
      id: 0,
      method: method,
      params: params
  }),
  };

  return options
}

async function fetchBalances(address, apiServer, setStatusMessages, offset = 0) {
  let method = 'get_balances';
  let filters = [{field: 'address', op: '==', value: address}, {field: 'quantity', op: '>', value: 0}];
  let params = {
    filters,
    filterop: 'and',
    offset: offset
  }
  const options = getOptions(params, method);
  const res = await fetch(apiServer, options);
  const data = await res.json();

  // Map the result to an array of asset names, add a caveat for ignoring XCP
  const assetNames = data.result.map(asset => asset.asset).filter(asset => asset !== 'XCP');

  // If result length is 1000, call the function again with offset increased by 1000
  if(data.result.length === 1000) {
      setStatusMessages(prevMessages => [...prevMessages, 'Fetching pepes...']);
      const nextAssetNames = await fetchBalances(address, apiServer, setStatusMessages, offset + 1000);
      return [...assetNames, ...nextAssetNames];
  } else {
      return assetNames;
  }
}

async function getAssetsData(assets, apiServer, setStatusMessages) {
  let method = 'get_asset_info';
  
  // Split assets into chunks of 1000
  const chunks = [];
  for (let i = 0; i < assets.length; i += 1000) {
    chunks.push(assets.slice(i, i + 1000));
  }

  // Fetch each chunk separately and concatenate the results
  let results = [];
  for (const chunk of chunks) {
    let params = {
      assets: chunk,
    }
    const options = getOptions(params, method);
    setStatusMessages(prevMessages => [...prevMessages, 'Fetching CIDs...']);
    const res = await fetch(apiServer, options);
    const data = await res.json();
    results = [...results, ...data.result];
  }

  // Filter out assets whose description does not start with 'IPFS:' and map to an array of {asset, cid} objects
  const ipfsAssets = results
    .filter(asset => asset.description.startsWith('IPFS:'))
    .map(asset => ({
      asset: asset.asset,
      cid: asset.description.replace('IPFS:', '').trim()
    }));

  return ipfsAssets;
}

async function fetchCidsFromAddress(address, counterpartyApi, setStatusMessages) {
  const assets = await fetchBalances(address, counterpartyApi, setStatusMessages);
  const assetCids = await getAssetsData(assets, counterpartyApi, setStatusMessages);
  return assetCids;
}

function extractCids(jsonData) {
  const cidRegex = /[bQ][a-zA-Z0-9]{44,59}/g; // Regular expression to match both v0 and v1 CIDs
  let assets = [];
  if (jsonData.images) {
    assets = jsonData.images.map(image => {
      const url = new URL(image.data);
      const cidMatch = url.toString().match(cidRegex);
      const cid = cidMatch ? cidMatch[0] : null;
      const filename = url.searchParams.get('filename');
      //return an array of cid values no object
      return cid
    });
  }
  if (jsonData.video) {
    const videoAssets = jsonData.video.map(video => {
      const url = new URL(video.data);
      const cidMatch = url.toString().match(cidRegex);
      const cid = cidMatch ? cidMatch[0] : null;
      const filename = url.searchParams.get('filename');
      //return an array of cid values no object
      return cid
    });
    assets = [...assets, ...videoAssets];
  }
  return assets
}


const IPFSFormWithAddress = () => {
  const [address, setAddress] = useState('');
  const [statusMessages, setStatusMessages] = useState(["Waiting for address..."]);
  const [ipfsApiEndpoint, setIpfsApiEndpoint] = useState('http://127.0.0.1:5001');
  const [counterpartyApi, setCounterpartyApi] = useState('http://api.counterparty.io:4000');
  const [counterpartyApiCred, setCounterpartyApiCred] = useState('rpc:rpc');
  const [progress, setProgress] = useState(0); // Add a new state variable for progress

  const handleApiResponse = async (response, successMessage) => {
    if (response.ok) {
      setStatusMessages(prevMessages => [...prevMessages, successMessage]);
    } else {
      const errorMessage = await response.text();
      //console.error('Error response:', errorMessage);

      setStatusMessages(prevMessages => [...prevMessages, errorMessage]);
      
    }
  };

  const readFile = async (fileDestPath) => {
    const response = await fetch(`${ipfsApiEndpoint}/api/v0/files/read?arg=${fileDestPath}`, { method: 'POST' });
    const text = await response.text();
    return text;
  };

  const pinFile = async (cid) => {
    const response = await fetch(`${ipfsApiEndpoint}/api/v0/pin/add?arg=${cid}`, { method: 'POST' });
    console.log(response)
    handleApiResponse(response, 'File pinned successfully!');
  };

  const createMfsDirectory = async (dirPath) => {
    // Ensure dirPath starts with a leading slash
    const correctedDirPath = `/${dirPath.startsWith('/') ? dirPath.substring(1) : dirPath}`;
    try {
      const checkDirResponse = await fetch(`${ipfsApiEndpoint}/api/v0/files/stat?arg=${correctedDirPath}`, { method: 'POST' });
      if (checkDirResponse.status !== 500) {
        setStatusMessages(prevMessages => [...prevMessages, 'Directory already exists!']);
      } else {
        try {
          const response = await fetch(`${ipfsApiEndpoint}/api/v0/files/mkdir?arg=${correctedDirPath}&parents=true`, { method: 'POST' });
          handleApiResponse(response, 'Directory created successfully!');
        } catch (error) {
          handleApiResponse(error);
        }
      }
    } catch (error) {
      handleApiResponse(error);
    }
  };

  const addToMfs = async (srcPath, destPath) => {
    try {
      const checkFileResponse = await fetch(`${ipfsApiEndpoint}/api/v0/files/stat?arg=${destPath}`, { method: 'POST' });
      if (checkFileResponse.status !== 500) {
        setStatusMessages(prevMessages => [...prevMessages, 'File already exists!']);
      } else {
        try {
          const response = await fetch(`${ipfsApiEndpoint}/api/v0/files/cp?arg=${srcPath}&arg=${destPath}`, { method: 'POST' });
          handleApiResponse(response, 'File added successfully!');
        } catch (error) {
          handleApiResponse(error);
        }
      }
    } catch (error) {
      handleApiResponse(error);
    }
  };

  const testIpfsConnection = async () => {
    try {
      const response = await fetch(`${ipfsApiEndpoint}/api/v0/diag/sys`, { method: 'POST' });
      const text = await response.text();
      setStatusMessages(prevMessages => [...prevMessages, 'IPFS API found!']);
      console.log('System diagnostic information:', text);
    } catch (error) {
      setStatusMessages(prevMessages => [...prevMessages, `IPFS API not found at ${ipfsApiEndpoint}.`]);
      throw error;
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setStatusMessages(prevMessages => [...prevMessages, 'Processing...']); // Clear any previous status messages
    setProgress(1); // Reset progress at the start
  
    try {
      await testIpfsConnection();

      setStatusMessages(prevMessages => [...prevMessages, 'Fetching pepes...']);
      const ipfsAssets = await fetchCidsFromAddress(address, counterpartyApi, setStatusMessages);
      const totalTasks = ipfsAssets.length * 2; // Total number of tasks
      let completedTasks = 0; // Number of completed tasks
  
      setStatusMessages(prevMessages => [...prevMessages, 'Creating pepes directory...']);
      await createMfsDirectory('pepes'); // Create the 'pepes' directory if it doesn't exist
  
      for (const asset of ipfsAssets) {
        completedTasks++;
        setProgress((completedTasks / totalTasks) * 100); // Update progress

        const fileSrcPath = `/ipfs/${asset.cid}`;
        const fileDestPath = `/pepes/${asset.asset}/${asset.cid}.json`;
  
        setStatusMessages(prevMessages => [...prevMessages, `Creating directory for asset ${asset.asset}...`]);
        await createMfsDirectory(`pepes/${asset.asset}`); // Create the asset name directory inside 'pepes'
  
        setStatusMessages(prevMessages => [...prevMessages, `Pinning file ${asset.cid}.json ...`]);
        try {
          await pinFile(asset.cid);
        } catch (error) {
          setStatusMessages(prevMessages => [...prevMessages, `Error pinning file ${asset.cid}.json ...`]);
          continue;
        }
  
        setStatusMessages(prevMessages => [...prevMessages, `Adding file ${asset.cid}.json ...`]);
        await addToMfs(fileSrcPath, fileDestPath);

        setStatusMessages(prevMessages => [...prevMessages, `Reading file ${asset.cid}.json ...`]);
        const json = await readFile(fileDestPath);
        const cids = extractCids(JSON.parse(json));

        completedTasks++;
        for (const cid of cids) {
          
          setProgress((completedTasks / totalTasks) * 100); // Update progress

          setStatusMessages(prevMessages => [...prevMessages, `Pinning file ${cid} ...`]);
          try {
            await pinFile(cid);
          } catch (error) {
            setStatusMessages(prevMessages => [...prevMessages, `Error pinning file ${cid} ...`]);
            continue;
          }
          setStatusMessages(prevMessages => [...prevMessages, `Adding file ${cid} ...`]);
          await addToMfs(`/ipfs/${cid}`, `/pepes/${asset.asset}/${cid}`);
        }

      }
      setProgress(100); // Set progress to 100% when all tasks are complete
      setStatusMessages(prevMessages => [...prevMessages, 'All files pinned and added successfully!']);
    } catch (error) {
      console.error('Error:', error);
      setStatusMessages(prevMessages => [...prevMessages, 'An error occurred. Please try again.']);
    }
  };

  useEffect(() => {
    //scroll to bottom of status messages as they are added
    const element = document.getElementById('statusBox');
    element.scrollTop = element.scrollHeight;
  }, [statusMessages]);

  useEffect(() => {
    //test fetchBalances
    fetchBalances(address, counterpartyApi).then(data => getAssetsData(data, counterpartyApi)).then(data => {
      const results = data;
    })
  }, []);

  return (
    <div className="flex flex-col items-center justify-center p-4 w-full max-w-xl">
  
      <form onSubmit={handleSubmit} className="w-full bg-white shadow-md rounded px-8 pt-8 pb-8 mb-4 text-left">
        <div className="mb-5">
          <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="address">Counterparty Wallet Address</label>
          <input id="address" className="shadow appearance-none text-left border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline text-sm" type="text" placeholder="166wMkV6tjNmjXCXsrgwqapE9P2ikVZLca" value={address} onChange={(e) => setAddress(e.target.value)} required disabled={progress > 0} />
        </div>
 
        <div className="mb-2">
            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="ipfsApiEndpoint">IPFS API</label>
            <label className="block text-gray-500 text-xs mb-0.5" htmlFor="ipfsApiEndpoint">URL (local)</label>
            <input id="ipfsApiEndpoint" className="shadow appearance-none text-left border rounded w-full py-2 px-3 text-gray-700 mb-3 leading-tight focus:outline-none focus:shadow-outline text-sm" type="text" placeholder="http://127.0.0.1:5001" value={ipfsApiEndpoint} onChange={(e) => setIpfsApiEndpoint(e.target.value)} required disabled={progress > 0} />
        </div>
        <div className="flex mb-6">
        <div className="w-2/3 pr-1">
            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="counterpartyApi">Counterparty API</label>
            <label className="block text-gray-500 text-xs mb-0.5" htmlFor="counterpartyApi">URL (local or remote)</label>
            <input id="counterpartyApi" className="shadow appearance-none text-left border rounded w-full py-2 px-3 text-gray-700 mb-3 leading-tight focus:outline-none focus:shadow-outline text-sm" type="text" placeholder="http://api.counterparty.io:4000" value={counterpartyApi} onChange={(e) => setCounterpartyApi(e.target.value)} required disabled={progress > 0} />
          </div>
        <div className="w-1/3 pl-1">
            <label className="block text-gray-700 text-sm font-bold mb-2 h-5" htmlFor="counterpartyApiCred"></label>
            <label className="block text-gray-500 text-xs mb-0.5" htmlFor="counterpartyApiCred">Credentials</label>
            <input id="counterpartyApiCred" className="shadow appearance-none text-left border rounded w-full py-2 px-3 text-gray-700 mb-3 leading-tight focus:outline-none focus:shadow-outline text-sm" type="text" placeholder="rpc:rpc" value={counterpartyApiCred} onChange={(e) => setCounterpartyApiCred(e.target.value)} required disabled={progress > 0} />
          </div>
 
        </div>
        <div className="flex items-center justify-center">
          {progress === 0 ? (
            <button className="uppercase bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline" type="submit">
              Log Those Frogs!
            </button>
          ) : (
            <button className="uppercase bg-gray-500 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline" onClick={() => window.location.reload()}>
              Reload
            </button>
          )}
        </div>
      </form>

    
        <ProgressBar progress={progress} /> 
        <div id="statusBox" className="overflow-y-auto h-24 border border-gray-500 mt-4 w-[480px] bg-gray-200 py-0.5 px-1">
        {statusMessages.map((message, index) => (
          <p className="text-left text-gray-500 text-xs" key={index}>&gt; {message}</p>
        ))}
        </div>
  
   
    </div>
  );
};


Modal.setAppElement('#root');

function App() {

  const [modalIsOpen, setModalIsOpen] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [hideShowOption, setHideShowOption] = useState(false);

  useEffect(() => {
    const dontShowAgain = localStorage.getItem('dontShowAgain');
    if (!dontShowAgain) {
      setShowModal(true);
    } else {
      setHideShowOption(true);
    }
  }, []);

  const handleCheckboxChange = (event) => {
    if (event.target.checked) {
      localStorage.setItem('dontShowAgain', 'true');
    } else {
      localStorage.removeItem('dontShowAgain');
    }
  };

  const handleIPFSinfo = () => {
    setModalIsOpen(true);
  };

  const closeModal = () => {
    setModalIsOpen(false);
  };

  const closeInfoModal = () => {
    const dontShowAgain = localStorage.getItem('dontShowAgain');
    if (dontShowAgain) {
      setHideShowOption(true);
    }
    setShowModal(false);
  }

  return (
    <>
    <div>
        <Modal
          isOpen={showModal}
          onRequestClose={() => setShowModal(false)}
          contentLabel="Do First"
          className="bg-white rounded p-8 outline-none text-center mx-auto my-0 absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[580px]"
          overlayClassName="fixed inset-0 bg-black bg-opacity-25"
        >
        <h2 className="text-2xl font-bold mb-4">Do First&#33;</h2>
        
        <p className="mb-4 text-left">1. Download and install <a href="https://docs.ipfs.tech/install/ipfs-desktop/" target="_blank" rel="noopener noreferrer" className="font-bold underline">
          
          IPFS Desktop</a></p> 
       
        <p className="mb-4 text-left">2. Open <span className="font-bold">IPFS Desktop</span>, click on <span className="font-bold">Settings</span> and scroll to <span className="font-bold">IPFS CONFIG.</span></p>

        <p className="mb-4 text-left">3. If the Access-Control-Allow-Origin object is missing from the IPFS config, <span className="font-bold">restart IPFS Desktop.</span></p>

        <p className="text-left">4. Add <span className="font-bold">http://localhost:5180</span> to your IPFS config file.</p> 
        
        <img src={ipfsConfigScreen} className="w-2/3 mx-auto" alt="logo" />

        <button onClick={closeInfoModal} className="mt-8 bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline">Close</button>
        {hideShowOption ? null : (
        <div className="mt-2">
        <label>
          <input type="checkbox" onChange={handleCheckboxChange} />
          <div className="inline-block pl-1 text-xs">Don&#39;t show on start.</div>
        </label>
        </div>
        )}
      </Modal>
      <div className="flex items-center justify-center">
        <div className="flex items-center space-x-1">
          <img src={jpegsaverLogo} className="w-24" alt="logo" />
          <h1 className="text-6xl font-bold text-gray-700">Frog Logger</h1>
        </div>
      </div>

      <div>
      <div className="text-gray-500 text-sm font-bold underline cursor-pointer inline-block" onClick={() => handleIPFSinfo()}>What is this?</div> - <div className="text-gray-500 text-sm font-bold underline cursor-pointer inline-block" onClick={() => setShowModal(true)}>System Setup</div> 
      </div>

      <div className="text-gray-700 mt-4 mb-8 italic text-xl">Because no one cares what your pepes look like but you.</div>
        
      </div>
    <div>
      <IPFSFormWithAddress />
      </div>
      <Modal
        isOpen={modalIsOpen}
        onRequestClose={closeModal}
        contentLabel="What is this?"
        
        className="bg-white rounded p-8 outline-none text-center mx-auto my-0 absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2"
        overlayClassName="fixed inset-0 bg-black bg-opacity-25"
      >
        <h2 className="text-2xl font-bold mb-4">How does it work&#63;</h2>
        <div>Frog Logger is a tool for pepe artists and collectors to backup their collection to their home computer as well as pin it to their own IPFS node for discovery by others.</div>
        <div className="my-4">Pepes will only be saved by Frog Logger if they conform to the IPFS format in <a href="https://github.com/CounterpartyXCP/cips/blob/master/cip-0025.md#ipfs-format" target="_blank" rel="noopener noreferrer">CIP-25</a> which includes pepes minted with <a href="https://rarepepewallet.wtf" target="_blank" rel="noopener noreferrer">Rare Pepe Wallet</a>.</div>
       
        

        <button onClick={closeModal} className="mt-4 bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline">
          Close
        </button>

      </Modal>
    </>
  )
}

export default App


// const IPFSForm = () => {
//   const [cid, setCid] = useState('');
//   const [fileExtension, setFileExtension] = useState('');
//   const [mfsDir, setMfsDir] = useState('pepes');
//   const [ipfsApiEndpoint, setIpfsApiEndpoint] = useState('http://127.0.0.1:5001');
//   const [statusMessages, setStatusMessages] = useState([]);


 

//   const handleSubmit = async (event) => {
//     event.preventDefault();
//     setStatusMessages(['Processing...']); // Clear any previous status messages
//     const fileSrcPath = `/ipfs/${cid}`;
//     const fileDestPath = `/${mfsDir}/${cid}.${fileExtension}`;
//     await pinFile(cid);
//     await addToMfs(fileSrcPath, fileDestPath);
//   };

//   return (
//     <div className="flex flex-col items-center justify-center p-4">
//       <form onSubmit={handleSubmit} className="w-full max-w-lg bg-white shadow-md rounded px-8 pt-6 pb-8 mb-4">
//         <div className="mb-4">
//           <input className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline" type="text" placeholder="CID to Pin" value={cid} onChange={(e) => setCid(e.target.value)} required />
//         </div>
//         <div className="mb-4">
//           <input className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline" type="text" placeholder="File Extension" value={fileExtension} onChange={(e) => setFileExtension(e.target.value)} required />
//         </div>
//         <div className="mb-6">
//           <input className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 mb-3 leading-tight focus:outline-none focus:shadow-outline" type="text" placeholder="IPFS API Endpoint" value={ipfsApiEndpoint} onChange={(e) => setIpfsApiEndpoint(e.target.value)} required />
//         </div>
//         <div className="flex items-center justify-center">
//           <button className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline" type="submit">
//             Get Those Frogs!
//           </button>
//         </div>
//       </form>
//       <div>
//   {statusMessages.map((message, index) => (
//     <p className="text-center text-gray-500 text-xs" key={index}>{message}</p>
//   ))}
// </div>
//     </div>

//   );
// };

// function AddressData({ address }) {
//   const [ipfsData, setIpfsData] = useState([]);

//   useEffect(() => {
//     fetchIPFSJsonFromAddress(address)
//       .then(data => setIpfsData(data))
//       .catch(error => console.error(error));
//   }, [address]); // This will re-run the effect if the address prop changes

//   // Render your component based on the state
//   return (
//     <div>
//       {ipfsData.map(asset => (
//         <div key={asset.cid}>
//           <p>Asset: {asset.asset}</p>
//           <p>CID: {asset.cid}</p>
//         </div>
//       ))}
//     </div>
//   );
// }

// async function fetchIPFSJsonFromAddress(address) {
//   try {
//     const response = await fetch(`https://xchain.io/api/balances/${address}`);
//     if (!response.ok) {
//       throw new Error('Network response was not ok');
//     }
//     const data = await response.json();
//     const ipfsAssets = data.data
//       .filter(asset => asset.description.startsWith('IPFS:'))
//       .map(asset => ({
//         asset: asset.asset,
//         cid: asset.description.replace('IPFS:', '').trim()
//       }));
    
//     return ipfsAssets;
//   } catch (error) {
//     console.error('There has been a problem with your fetch operation:', error);
//     return [];
//   }
// }

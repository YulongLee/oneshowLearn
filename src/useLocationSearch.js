import {useEffect,useState} from 'react';
export function useLocationSearch(){
 const [location,setLocation]=useState(()=>({search:window.location.search,revision:0}));
 useEffect(()=>{const update=()=>setLocation(old=>({search:window.location.search,revision:old.revision+1}));window.addEventListener('oneshowlearn:route-change',update);return()=>window.removeEventListener('oneshowlearn:route-change',update);},[]);
 return location;
}

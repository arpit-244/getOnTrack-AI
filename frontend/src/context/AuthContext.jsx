import {createConext,useContext, useEffect, useState} from "react";

const AuthContext= createContext(null);

export const useAuth=()=>useContext(AuthContext);

export const AuthProvider=({children})=>{
    const [user,setUser]=useState(()=>{
        const raw=localStorage.getItem("user");
        return raw ? JSON.parse(raw) : null;
    });
    const [loading,setLoading]=useState(true);

    useEffect(()=>{
        const token=localStorage.getItem("token");
        if(!token){
            setLoading(false);
            return;
        }

        
        
    })
}


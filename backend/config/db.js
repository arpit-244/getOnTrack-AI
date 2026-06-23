import mongoose from 'mongoose';

export const connectDB= async () =>{
    try{
        const uri=process.env.MONGO_URI;
        if(!uri) throw new error (" MongoDB URI not found");
        const conn=await mongoose.connect(uri);;
        console.log("MongoDB connected: ${conn.connection.host}");

    }catch (err){
        console.error("MongoDB connection failed:",err.message);
        process.exit(1);
    }
};
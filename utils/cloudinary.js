import{v2 as cloudinary} from 'cloudinary';
import fs from'fs';
    
const uploadOnCloudinary = async(localFilePath) =>{
    
    cloudinary.config({ 
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME, 
        api_key:process.env.CLOUDINARY_API_KEY, 
        api_secret: process.env.CLOUDINARY_API_SECRET // Click 'View API Keys' above to copy your API secret
    });

    try{
        if(!localFilePath) return null;
        //uplaod the file on cloudinary
        const response = await cloudinary.uploader.upload(localFilePath,{
            resource_type:"image",
        })
        fs.unlinkSync(localFilePath)
        
        //File has been uploaded successfully
        console.log(
            "file is uploaded on cloudinary",
            response.url
        );
            return response;
    }
    catch(error){
        fs.unlinkSync(localFilePath)  // remove the locally saved temporary file as the upload option got failed
        console.log("Error While Uploading the File on Cloudinary,",error)
        return null;
    }
}   

export{uploadOnCloudinary}
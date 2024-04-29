import {v2 as cloudinary} from 'cloudinary';
import fs from 'fs';
          
cloudinary.config({ 
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME, 
  api_key: process.env.CLOUDINARY_API_KEY, 
  api_secret: process.env.CLOUDINARY_API_SECRET  
});

const uploadOnCloudinary = async (localFilePath) => {
    try {
        // if file path is not defined
        if(!localFilePath) return null;
        // uploading the file on cloudinary
        const response = await cloudinary.uploader.upload(localFilePath, {
            resource_type: "auto",
        });
        // after the file is uploaded on cloudinary
        // console.log("File is uploaded successfully!!!", response.url);
        fs.unlinkSync(localFilePath);
        return response;
    } catch (error) {
        // to remove the locally saved temporary file as the upload operation failed.
        fs.unlinkSync(localFilePath);
        return null;
    }
}

export { uploadOnCloudinary };
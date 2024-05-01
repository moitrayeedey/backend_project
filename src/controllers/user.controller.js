import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { User } from '../models/user.model.js'
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";



const registerUser = asyncHandler(async (req, res) => {
    // get user details from frontend
    const {username, email, fullname, password} = req.body;
    // console.log(`username: ${username}, email: ${email}, fullname: ${fullname}, password: ${password}`);

    // get the details validated
    if(
        [fullname, email, username, password].some((field) => field?.trim() === "") 
    ) {
        throw new ApiError(400, "all fields are required!");
    };

    // check if user already exists
    const userExists = await User.findOne({
        $or: [{ username }, { email }]
    });

    if(userExists) {
        throw new ApiError(409, "User with the given username or email already exists");
    };

    console.log(req.files);

    // check for images, avatar
    const avatarLocalPath = req.files?.avatar[0]?.path;
    //const coverImageLocalPath = req.files?.coverImage[0]?.path;
    let coverImageLocalPath;
    if(req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length > 0) {
        coverImageLocalPath = req.files.coverImage[0].path;
    }

    if(!avatarLocalPath) {
        throw new ApiError(400, "Avatar file is required!");
    }

    // upload them to cloudinary, check for avatar
    const avatar = await uploadOnCloudinary(avatarLocalPath);
    const coverImage = await uploadOnCloudinary(coverImageLocalPath);
    
    if(!avatar) {
        throw new ApiError(400, "Avatar file is required!")
    }

    // create user object - create entry in db
    const userObj = await User.create({
        fullname,
        avatar: avatar.url,
        coverImage: coverImage?.url || "",
        email,
        password,
        username: username.toLowerCase()
    });

    // remove password and refresh token field from response
    const isUserCreated = await User.findById(userObj._id).select(
        "-password -refreshToken"
    );

    if(!isUserCreated) {
        throw new ApiError(500, "Something went wrong while registering the user.");
    };

    // check for user creation response: if successful return it, else send error
    return res.status(201).json(
        new ApiResponse(200, isUserCreated, "User registered successfully!")
    );
});

export { registerUser };
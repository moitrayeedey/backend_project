import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { User } from '../models/user.model.js'
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js"; 
import jwt from 'jsonwebtoken';
 
const generateAccessAndRefreshTokens = async(userId) => {
    try {
        const user = await User.findById(userId);
        const accessToken = user.generateAccessToken();
        const refreshToken = user.generateRefreshToken();

        user.refreshToken = refreshToken;
        await user.save({ validateBeforeSave: false });

        return {accessToken, refreshToken};
    } catch (error) {
        throw new ApiError(500, "Something went wrong while generating access and refresh tokens");
    }
}
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

const loginUser = asyncHandler(async (req, res) => {
    // take the username or email and password from the user.
    // check whether all the fields are provided
    const {email, username, password} = req.body;

    if(!(username || email)) {
        throw new ApiError(400, "please provide either username or email");
    };

    // check whether the username or email exists in the db
    // if exists check for the password else send the message user does not exists
    // if password is incorrect throw error
    // if password correct send access and refresh token to the user as cookies 
    const userExists = await User.findOne({
        $or: [{email}, {username}]
    });
    if(!userExists) {
        throw new ApiError(404, "User does not exist");
    }
    const isPasswordValid = await userExists.isPasswordCorrect(password);

    if(!isPasswordValid) {
        throw new ApiError(401, "Invalid user credentials");
    }
    
    const {accessToken, refreshToken} = await generateAccessAndRefreshTokens(userExists._id); 
    
    const loggedInUser = User.findById(userExists._id).select("-password -refreshToken");

    const cookieOptions = {
        httpOnly: true,
        secure: true,
    };

    return res
    .status(200)
    .cookie("accessToken", accessToken, cookieOptions)
    .cookie("refreshToken", refreshToken, cookieOptions)
    .json(
        new ApiResponse(200, {
            user: loggedInUser, accessToken, refreshToken
        }, "User logged in successfully")
    )
});

const logoutUser = asyncHandler(async(req, res) => {
    await User.findByIdAndUpdate(
        req.user._id, 
        {
            $set: {
            refreshToken: undefined 
            }
        }, 
        {
            new: true
        });
        const cookieOptions = {
            httpOnly: true,
            secure: true,
        };
        return res
        .status(200)
        .clearCookie("accessToken", cookieOptions)
        .clearCookie("refreshToken", cookieOptions)
        .json(new ApiResponse(200, {}, "User logged out successfully"));
});

const refreshAccessToken = asyncHandler(async(req, res) => {
    const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken;

    if(!incomingRefreshToken) {
        throw new ApiError(401, "Unauthorized request");
    };
    try {
        const decodedToken = jwt.verify(incomingRefreshToken, process.env.REFRESH_TOKEN_SECRET);
    
        const user = await User.findById(decodedToken?._id);
    
        if(!user) {
            throw new ApiError(401, "Invalid refresh token");
        }
    
        if(incomingRefreshToken !== user?.refreshToken) {
            throw new ApiError(401, "Used or expired refresh token");
        }
    
        const cookieOptions = {
            httpOnly: true,
            secure: true,
        }
    
        const {accessToken, newRefreshToken} = await generateAccessAndRefreshTokens(user._id);
    
        return res
        .status(200)
        .cookie("Access Token", accessToken, cookieOptions)
        .cookie("Refresh Token", newRefreshToken, cookieOptions)
        .json(
            new ApiResponse(
                200,
                {accessToken, refreshToken: newRefreshToken},
                "Access token refreshed"
            )
        )
    } catch (error) {
        throw new ApiError(401, error?.message || "Invalid refresh token");
    }
});

export { registerUser, loginUser, logoutUser, refreshAccessToken };
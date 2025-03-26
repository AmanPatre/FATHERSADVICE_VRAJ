import multer from "multer"; 

// directly taking from the github page of the  multer docs
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, './public/temp')
  },
  filename: function (req, file, cb) {
    cb(null, file.originalname)
  }
})
export const upload = multer({ 
  storage
})
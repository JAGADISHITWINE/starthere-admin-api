import multer from 'multer';

const storage = multer.diskStorage({
  destination: 'uploads/treks',
  filename: (_, file, cb) =>
    cb(file.originalname),
});

export const upload = multer({ storage });

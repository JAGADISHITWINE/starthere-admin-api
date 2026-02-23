const router = require('express').Router();
const auth = require('../controllers/auth.controller');
const user = require('../controllers/user.controller');
const trek = require('../controllers/trek.controlller');
const analytics = require('../controllers/analytics.controller');
const booking = require('../controllers/booking.controller');
const postEditorController = require('../controllers/postEditor.controller');
const multer = require('multer');
const path = require('path');

/* ---------- MULTER CONFIGURATION ---------- */

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/treks/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});



const upload = multer({ storage: storage });

const uploadPost = require('../middleware/uploadPost');

/* ---------- AUTH ---------- */
router.post('/login', auth.login);
router.get('/dashData', auth.getDashboardData);

/* ---------- USERS ---------- */
router.get('/getUsers', user.getUsersData);
router.get('/user/:userid/getUserById', user.getUserById);

/* ---------- TREKS ---------- */
router.post(
  '/createTrek',
  upload.fields([
    { name: 'coverImage', maxCount: 1 },
    { name: 'gallery', maxCount: 10 },
  ]),
  trek.createTrek
);

router.get('/getAllTreks', trek.getAllTreks);
router.get('/getTrekById/:id', trek.getTrekById);
router.get('/getTrekByIdToUpdate/:id', trek.getTrekByIdToUpdate);
router.get('/treks/:trekId/batches',trek.getBatchesById);
router.get('/batches/:batchId/bookings',trek.getBookingsById);
router.patch('/batches/:batchId/stop-booking',trek.stopBooking)
router.patch('/batches/:batchId/resume-booking',trek.resumeBooking)
router.get('/batches/:batchId/export-bookings',trek.exportBookings);
router.get('/treks/:trekId/export-all-bookings',trek.exportallBookings);
router.get('/treks', trek.getTreks);

router.post(
  '/treks/:id',
  upload.fields([
    { name: 'coverImage', maxCount: 1 },
    { name: 'gallery', maxCount: 10 }
  ]),
  trek.updateTrek
);

router.get('/revenue', analytics.getAllRevenueData)
router.get('/bookingData', booking.getAllBookingData)
router.get('/bookings/completion-stats',booking.updateCompletedBookings)
router.put('/batches/:batchId/complete', booking.updateBatchCompleted)

// Post routes
router.get('/postEditor', postEditorController.getAllPosts);
router.get('/postEditor/:id', postEditorController.getPostById);
router.post(
  '/postEditor',
  uploadPost.single('image'),
  postEditorController.createPost
);
router.post('/postEditor/:id', uploadPost.single('image'), postEditorController.updatePost);
router.delete('/postEditor/:id', postEditorController.deletePost);

// Categories route
router.get('/categories', postEditorController.getCategories);
router.get('/reviews', postEditorController.reviews);

module.exports = router;
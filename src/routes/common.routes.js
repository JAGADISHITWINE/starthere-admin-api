const router = require('express').Router();
const auth = require('../controllers/auth.controller');
const user = require('../controllers/user.controller');
const trek = require('../controllers/trek.controlller');
const analytics = require('../controllers/analytics.controller');
const booking = require('../controllers/booking.controller');
const notifications = require('../controllers/notifications.controller');
const dropdown = require('../controllers/dropdown.controller');
const rbac = require('../controllers/rbac.controller');
const admins = require('../controllers/admins.controller');
const coupon = require('../controllers/coupon.controller');
const postEditorController = require('../controllers/postEditor.controller');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const sharedUploadsRoot = process.env.SHARED_UPLOADS_DIR
  ? path.resolve(process.env.SHARED_UPLOADS_DIR)
  : path.resolve(__dirname, '../../../shared-uploads');
const trekUploadsDir = path.join(sharedUploadsRoot, 'treks');
if (!fs.existsSync(trekUploadsDir)) {
  fs.mkdirSync(trekUploadsDir, { recursive: true });
}

/* ---------- MULTER CONFIGURATION ---------- */

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, trekUploadsDir);
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
router.post('/logout', auth.logout);

// All routes after this require authentication (cookie or Authorization header)
const authMiddleware = require('../middleware/auth.middleware');
const { requirePermission } = require('../middleware/permission.middleware');
router.use(authMiddleware);

router.get('/dashData', auth.getDashboardData);
router.get('/me', auth.me);
router.get('/rbac/table', rbac.getRbacTable);
router.put('/rbac/table', requirePermission('rbac.manage'), rbac.updateRbacTable);
router.post('/admins', requirePermission('rbac.manage'), admins.createAdminWithRole);
router.get('/coupons', requirePermission('treks.view'), coupon.getCoupons);
router.post('/coupons', requirePermission('treks.manage'), coupon.createCoupon);
router.put('/coupons/:id', requirePermission('treks.manage'), coupon.updateCoupon);
router.delete('/coupons/:id', requirePermission('treks.manage'), coupon.deleteCoupon);

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
router.get('/treks/:trekId/batches', trek.getBatchesById);
router.get('/batches/:batchId/bookings', trek.getBookingsById);
router.patch('/batches/:batchId/stop-booking', trek.stopBooking);
router.patch('/batches/:batchId/resume-booking', trek.resumeBooking);
router.get('/batches/:batchId/export-bookings', trek.exportBookings);
router.get('/treks/:trekId/export-all-bookings', trek.exportallBookings);
router.get('/treks', trek.getTreks);

router.post(
  '/treks/:id',
  upload.fields([
    { name: 'coverImage', maxCount: 1 },
    { name: 'gallery', maxCount: 10 }
  ]),
  trek.updateTrek
);

/* ---------- ANALYTICS + BOOKINGS ---------- */
router.get('/revenue', analytics.getAllRevenueData);
router.get('/bookingData', booking.getAllBookingData);
router.get('/bookings/completion-stats', booking.updateCompletedBookings);
router.put('/batches/:batchId/complete', booking.updateBatchCompleted);

/* ---------- DROPDOWNS + NOTIFICATIONS ---------- */
router.get('/dropdowns', dropdown.getDropdownOptions);
router.get('/dropdowns/batches', dropdown.getBatchDropdown);
router.get('/notifications', notifications.getNotifications);
router.post('/notifications/read-all', notifications.markAllNotificationsRead);
router.post('/notifications/read', notifications.markNotificationRead);

/* ---------- POSTS ---------- */
router.get('/postEditor', postEditorController.getAllPosts);
router.get('/postEditor/:id', postEditorController.getPostById);
router.post(
  '/postEditor',
  uploadPost.single('image'),
  postEditorController.createPost
);
router.post('/postEditor/:id', uploadPost.single('image'), postEditorController.updatePost);
router.delete('/postEditor/:id', postEditorController.deletePost);

/* ---------- CATEGORIES + REVIEWS ---------- */
router.get('/categories', postEditorController.getCategories);
router.get('/reviews', postEditorController.reviews);

module.exports = router;

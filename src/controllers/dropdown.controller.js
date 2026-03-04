const db = require('../config/db');
const { encrypt } = require('../service/cryptoHelper');

function toValue(text = '') {
  return String(text)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function createOptions(labels = [], prefix = 'opt') {
  const now = new Date().toISOString();
  return labels
    .filter((label) => !!String(label || '').trim())
    .map((label, index) => ({
      id: `${prefix}-${index + 1}`,
      label: String(label),
      value: toValue(label),
      status: 'active',
      createdAt: now,
      updatedAt: now
    }));
}

function mapBatchLabel(batch) {
  return `${batch.trek_name} (${batch.start_date} to ${batch.end_date})`;
}

async function getDropdownOptions(req, res) {
  try {
    const [categoryRows] = await db.query(
      'SELECT id, name FROM categories ORDER BY name ASC'
    );
    const [collectionRows] = await db.query(
      `SELECT DISTINCT collection
       FROM treks
       WHERE collection IS NOT NULL AND TRIM(collection) <> ''
       ORDER BY collection ASC`
    );

    const categories = categoryRows.map((row) => row.name);
    const defaultCollections = ['All Styles', 'Weekend Escapes', 'Beginner Friendly', 'Budget Picks', 'Scenic Routes'];
    const collections = Array.from(
      new Set([
        ...defaultCollections,
        ...collectionRows.map((row) => row.collection)
      ])
    );

    const groups = [
      {
        key: 'trekDifficulty',
        label: 'Trek Difficulty',
        page: 'Treks',
        options: createOptions(['Easy', 'Moderate', 'Difficult', 'Extreme', 'Challenging'], 'trekDifficulty')
      },
      {
        key: 'trekCategory',
        label: 'Trek Category',
        page: 'Treks',
        options: createOptions(['Hill Trek', 'Peak Trek', 'Mountain Trek', 'Forest Trek', 'Desert Trek', 'Snow Trek'], 'trekCategory')
      },
      {
        key: 'trekFitnessLevel',
        label: 'Trek Fitness Level',
        page: 'Treks',
        options: createOptions(['Beginner', 'Intermediate', 'Advanced', 'Expert'], 'trekFitnessLevel')
      },
      {
        key: 'trekCollection',
        label: 'Trek Collection',
        page: 'Treks',
        options: createOptions(collections, 'trekCollection')
      },
      {
        key: 'batchStatus',
        label: 'Batch Status',
        page: 'Treks',
        options: createOptions(['active', 'inactive', 'full', 'cancelled', 'completed'], 'batchStatus')
      },
      {
        key: 'bookingStatus',
        label: 'Booking Status',
        page: 'Bookings',
        options: createOptions(['pending', 'confirmed', 'cancelled', 'completed'], 'bookingStatus')
      },
      {
        key: 'reviewStatus',
        label: 'Review Status',
        page: 'Reviews',
        options: createOptions(['pending', 'approved', 'rejected'], 'reviewStatus')
      },
      {
        key: 'userStatus',
        label: 'User Status',
        page: 'Users',
        options: createOptions(['active', 'inactive', 'blocked'], 'userStatus')
      },
      {
        key: 'settingsTwoFactorMode',
        label: 'Two Factor Mode',
        page: 'Settings',
        options: createOptions(['Off', 'Optional', 'Mandatory'], 'settingsTwoFactorMode')
      },
      {
        key: 'dashboardRows',
        label: 'Dashboard Rows',
        page: 'Dashboard',
        options: createOptions(['5', '10', '20', '50'], 'dashboardRows')
      },
      {
        key: 'blogStatus',
        label: 'Blog Status',
        page: 'Blog',
        options: createOptions(['draft', 'published', 'archived'], 'blogStatus')
      },
      {
        key: 'blogCategory',
        label: 'Blog Category',
        page: 'Blog',
        options: createOptions(categories, 'blogCategory')
      }
    ];

    return res.status(200).json({
      success: true,
      data: encrypt(groups)
    });
  } catch (error) {
    console.error('Dropdown groups error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch dropdown groups'
    });
  }
}

async function getBatchDropdown(req, res) {
  try {
    const trekId = Number(req.query.trekId);
    if (!trekId || Number.isNaN(trekId)) {
      return res.status(400).json({
        success: false,
        message: 'Valid trekId is required'
      });
    }

    const [rows] = await db.query(
      `SELECT
        b.id,
        b.trek_id,
        t.name AS trek_name,
        DATE_FORMAT(b.start_date, '%Y-%m-%d') AS start_date,
        DATE_FORMAT(b.end_date, '%Y-%m-%d') AS end_date,
        b.status
      FROM trek_batches b
      INNER JOIN treks t ON t.id = b.trek_id
      WHERE b.trek_id = ?
      ORDER BY b.start_date ASC`,
      [trekId]
    );

    const data = rows.map((row) => ({
      value: row.id,
      label: mapBatchLabel(row),
      status: row.status,
      startDate: row.start_date,
      endDate: row.end_date
    }));

    return res.status(200).json({
      success: true,
      data: encrypt(data)
    });
  } catch (error) {
    console.error('Batch dropdown error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch batch dropdown'
    });
  }
}

module.exports = {
  getDropdownOptions,
  getBatchDropdown
};

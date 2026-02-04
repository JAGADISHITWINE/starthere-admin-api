const trekModel = require("../models/trek");
const db = require("../config/db");
const XLSX = require('xlsx');

async function createTrek(req, res) {


  try {
    if (!req.body) {
      return res.status(400).json({
        success: false,
        message: "Missing trek data",
      });
    }

    // Parse JSON fields from FormData
    let highlights = [];
    let batches = [];
    let thingsToCarry = [];
    let importantNotes = [];

    // Safely parse JSON strings
    try {
      if (req.body.highlights) {
        highlights = JSON.parse(req.body.highlights);
      }
    } catch (e) {
      console.error("Error parsing highlights:", e);
      return res.status(400).json({
        success: false,
        message: "Invalid highlights format",
      });
    }

    try {
      if (req.body.batches) {
        batches = JSON.parse(req.body.batches);
      }
    } catch (e) {
      console.error("Error parsing batches:", e);
      return res.status(400).json({
        success: false,
        message: "Invalid batches format",
      });
    }

    try {
      if (req.body.thingsToCarry) {
        thingsToCarry = JSON.parse(req.body.thingsToCarry);
      }
    } catch (e) {
      console.error("Error parsing thingsToCarry:", e);
      return res.status(400).json({
        success: false,
        message: "Invalid thingsToCarry format",
      });
    }

    try {
      if (req.body.importantNotes) {
        importantNotes = JSON.parse(req.body.importantNotes);
      }
    } catch (e) {
      console.error("Error parsing importantNotes:", e);
      return res.status(400).json({
        success: false,
        message: "Invalid importantNotes format",
      });
    }

    // Build trek object
    const trek = {
      name: req.body.name,
      location: req.body.location,
      difficulty: req.body.difficulty,
      category: req.body.category,
      fitnessLevel: req.body.fitnessLevel || null,
      description: req.body.description || null,
      highlights: highlights,
      batches: batches,
      thingsToCarry: thingsToCarry,
      importantNotes: importantNotes,
    };


    // Validate required fields
    if (!trek.name || !trek.location) {
      return res.status(400).json({
        success: false,
        message: "Trek name and location are required",
      });
    }

    // Validate cover image
    if (
      !req.files ||
      !req.files.coverImage ||
      req.files.coverImage.length === 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Cover image is required",
      });
    }

    // Create trek in database
    const trekId = await trekModel.createTrek(trek, req.files);

    res.status(201).json({
      success: true,
      message: "Trek created successfully",
      trekId,
      data: {
        id: trekId,
        name: trek.name,
        location: trek.location,
      },
    });
  } catch (err) {
    if (err.message === "DUPLICATE_TREK") {
      return res.status(409).json({
        success: false,
        message: "Trek already exists",
      });
    }

    console.error("Error creating trek:", err);
    res.status(500).json({
      success: false,
      message: "Failed to create trek",
      error: err.message,
    });
  }
}

async function getAllTreks(req, res) {
  const conn = await db.getConnection();

  try {
    const [rows] = await conn.query(`
      SELECT 
        t.id,
        t.name,
        t.location,
        t.category,
        t.difficulty,
        t.fitness_level,
        t.description,
        t.cover_image,
        b.duration,
        MIN(b.start_date) AS upcoming_date,
        MIN(b.price) AS starting_price,
        SUM(CASE WHEN b.status = 'active' THEN b.available_slots ELSE 0 END) AS total_available_slots,
        COUNT(DISTINCT b.id) AS total_batches,
        COUNT(DISTINCT CASE WHEN b.status = 'active' THEN b.id END) AS active_batches,
        t.created_at,
        t.updated_at
      FROM treks t
      LEFT JOIN trek_batches b 
        ON b.trek_id = t.id
        AND b.start_date >= CURDATE()
      GROUP BY t.id, t.name, t.location, t.category, t.difficulty, 
               t.fitness_level, t.description, t.cover_image, b.duration
      ORDER BY t.created_at DESC
    `);

    // Get highlights count for each trek
    for (const trek of rows) {
      const [[{ highlight_count }]] = await conn.query(
        "SELECT COUNT(*) as highlight_count FROM trek_highlights WHERE trek_id = ?",
        [trek.id],
      );
      trek.highlight_count = highlight_count;

      // Format dates
      trek.upcoming_date = trek.upcoming_date
        ? new Date(trek.upcoming_date).toISOString().split("T")[0]
        : null;

      // Add availability status
      trek.has_available_slots = trek.total_available_slots > 0;
    }

    res.status(200).json({
      success: true,
      count: rows.length,
      data: rows,
    });
  } catch (err) {
    console.error("Error fetching treks:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch treks",
      error: err.message,
    });
  } finally {
    conn.release();
  }
}

async function getTrekById(req, res) {
  const trekId = req.params.id;
  const conn = await db.getConnection();

  try {
    // Get basic trek info
    const [[trek]] = await conn.query("SELECT * FROM treks WHERE id = ?", [
      trekId,
    ]);

    if (!trek) {
      return res.status(404).json({
        success: false,
        message: 'Trek not found'
      });
    }

    // Get highlights
    const [highlights] = await conn.query(
      "SELECT highlight FROM trek_highlights WHERE trek_id = ?",
      [trekId],
    );
    trek.highlights = highlights.map((h) => h.highlight);

    // Get things to carry
    const [thingsToCarry] = await conn.query(
      "SELECT item FROM trek_things_to_carry WHERE trek_id = ? ORDER BY display_order",
      [trekId],
    );
    trek.thingsToCarry = thingsToCarry.map((t) => t.item);

    // Get important notes
    const [importantNotes] = await conn.query(
      "SELECT note FROM trek_important_notes WHERE trek_id = ? ORDER BY display_order",
      [trekId],
    );
    trek.importantNotes = importantNotes.map((n) => n.note);

    // Get gallery images
    const [images] = await conn.query(
      "SELECT image_url FROM trek_images WHERE trek_id = ?",
      [trekId],
    );
    trek.galleryImages = images.map((img) => img.image_url);

    // Get batches
    const [batches] = await conn.query(
      "SELECT * FROM trek_batches WHERE trek_id = ?",
      [trekId],
    );

    // For each batch, get inclusions, exclusions, and itinerary
    for (const batch of batches) {
      // Get inclusions
      const [inclusions] = await conn.query(
        "SELECT inclusion FROM batch_inclusions WHERE batch_id = ?",
        [batch.id],
      );
      batch.inclusions = inclusions.map((i) => i.inclusion);

      // Get exclusions
      const [exclusions] = await conn.query(
        "SELECT exclusion FROM batch_exclusions WHERE batch_id = ?",
        [batch.id],
      );
      batch.exclusions = exclusions.map((e) => e.exclusion);

      // Get itinerary days
      const [days] = await conn.query(
        "SELECT * FROM itinerary_days WHERE batch_id = ? ORDER BY day_number",
        [batch.id],
      );

      // For each day, get activities
      for (const day of days) {
        const [activities] = await conn.query(
          "SELECT activity_time, activity_text FROM itinerary_activities WHERE day_id = ? ORDER BY activity_time",
          [day.id],
        );
        day.activities = activities.map((a) => ({
          activityTime: a.activity_time,
          activityText: a.activity_text,
        }));

        // Remove internal id from response
        delete day.id;
        delete day.batch_id;
        delete day.created_at;
      }

      batch.itineraryDays = days;

      // Clean up batch object
      delete batch.id;
      delete batch.trek_id;
      delete batch.created_at;
      delete batch.updated_at;
    }

    trek.batches = batches;

    // Clean up trek object - keep id for reference
    // delete trek.id;

    // Send response
    res.status(200).json({
      success: true,
      data: trek
    });

  } catch (err) {
    console.error('Error fetching trek:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch trek',
      error: err.message
    });
  } finally {
    conn.release();
  }
}

async function getTrekByIdToUpdate(req, res) {
  const trekId = req.params.id;
  const conn = await db.getConnection();

  try {
    // 🔹 Trek basic info
    const [[trek]] = await conn.query(`SELECT * FROM treks WHERE id = ?`, [
      trekId,
    ]);

    if (!trek) {
      return res.status(404).json({
        success: false,
        message: "Trek not found",
      });
    }

    // 🔹 Highlights
    const [highlights] = await conn.query(
      `SELECT highlight FROM trek_highlights WHERE trek_id = ?`,
      [trekId],
    );

    // 🔹 Things to Carry
    const [thingsToCarry] = await conn.query(
      `SELECT item FROM trek_things_to_carry WHERE trek_id = ? ORDER BY display_order`,
      [trekId],
    );

    // 🔹 Important Notes
    const [importantNotes] = await conn.query(
      `SELECT note FROM trek_important_notes WHERE trek_id = ? ORDER BY display_order`,
      [trekId],
    );

    // 🔹 Gallery Images
    const [images] = await conn.query(
      `SELECT image_url FROM trek_images WHERE trek_id = ?`,
      [trekId],
    );

    // 🔹 Batches
    const [batches] = await conn.query(
      `SELECT
        id,
        DATE_FORMAT(start_date, '%Y-%m-%d') AS startDate,
        DATE_FORMAT(end_date, '%Y-%m-%d') AS endDate,
        available_slots AS availableSlots,
        booked_slots AS bookedSlots,
        price,
        min_age AS minAge,
        max_age AS maxAge,
        min_participants AS minParticipants,
        max_participants AS maxParticipants,
        duration,
        status AS batchStatus
      FROM trek_batches
      WHERE trek_id = ?
      ORDER BY start_date ASC`,
      [trekId],
    );

    // 🔹 For each batch, get inclusions, exclusions, and itinerary
    for (const batch of batches) {
      // Get batch inclusions
      const [inclusions] = await conn.query(
        `SELECT inclusion FROM batch_inclusions WHERE batch_id = ?`,
        [batch.id],
      );
      batch.inclusions = inclusions.map((i) => i.inclusion);

      // Get batch exclusions
      const [exclusions] = await conn.query(
        `SELECT exclusion FROM batch_exclusions WHERE batch_id = ?`,
        [batch.id],
      );
      batch.exclusions = exclusions.map((e) => e.exclusion);

      // Get itinerary days
      const [itineraryDays] = await conn.query(
        `SELECT id, day_number AS dayNumber, title 
         FROM itinerary_days 
         WHERE batch_id = ? 
         ORDER BY day_number`,
        [batch.id],
      );

      // For each day, get activities
      for (const day of itineraryDays) {
        const [activities] = await conn.query(
          `SELECT 
            TIME_FORMAT(activity_time, '%H:%i') AS activityTime,
            activity_text AS activityText
           FROM itinerary_activities 
           WHERE day_id = ? 
           ORDER BY activity_time`,
          [day.id],
        );
        day.activities = activities;

        // Remove internal ID
        delete day.id;
      }

      batch.itineraryDays = itineraryDays;

      // Remove internal batch ID from response
      delete batch.id;
    }

    // Build response
    res.status(200).json({
      success: true,
      data: {
        id: trek.id,
        name: trek.name,
        location: trek.location,
        category: trek.category,
        difficulty: trek.difficulty,
        fitnessLevel: trek.fitness_level,
        description: trek.description,
        coverImage: trek.cover_image,
        highlights: highlights.map((h) => h.highlight),
        thingsToCarry: thingsToCarry.map((t) => t.item),
        importantNotes: importantNotes.map((n) => n.note),
        batches: batches,
        galleryImages: images.map((img) => img.image_url),
        createdAt: trek.created_at,
        updatedAt: trek.updated_at,
      },
    });
  } catch (err) {
    console.error("Error fetching trek:", err);
    res.status(500).json({
      // Changed from 200 to 500
      success: false,
      message: "Failed to fetch trek details",
      error: err.message,
    });
  } finally {
    conn.release();
  }
}

async function updateTrek(req, res) {
  try {
    const trekId = Number(req.params.id);

    // Validate trek ID
    if (!trekId || isNaN(trekId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid trek ID",
      });
    }

    if (!req.body) {
      return res.status(400).json({
        success: false,
        message: "Missing trek data",
      });
    }

    // Parse JSON fields from FormData (same pattern as create)
    let highlights = [];
    let batches = [];
    let thingsToCarry = [];
    let importantNotes = [];
    let deletedGallery = [];

    // Safely parse each JSON field
    try {
      if (req.body.highlights) {
        highlights = JSON.parse(req.body.highlights);
      }
    } catch (e) {
      console.error('Error parsing highlights:', e);
    }

    try {
      if (req.body.batches) {
        batches = JSON.parse(req.body.batches);
      }
    } catch (e) {
      console.error('Error parsing batches:', e);
    }

    try {
      if (req.body.thingsToCarry) {
        thingsToCarry = JSON.parse(req.body.thingsToCarry);
      }
    } catch (e) {
      console.error('Error parsing thingsToCarry:', e);
    }

    try {
      if (req.body.importantNotes) {
        importantNotes = JSON.parse(req.body.importantNotes);
      }
    } catch (e) {
      console.error('Error parsing importantNotes:', e);
    }

    try {
      if (req.body.deletedGallery) {
        deletedGallery = JSON.parse(req.body.deletedGallery);
      }
    } catch (e) {
      console.error('Error parsing deletedGallery:', e);
    }

    // Build trek object
    const trek = {
      name: req.body.name,
      location: req.body.location,
      difficulty: req.body.difficulty,
      category: req.body.category,
      fitnessLevel: req.body.fitnessLevel || null,
      description: req.body.description || null,
      highlights: highlights,
      batches: batches,
      thingsToCarry: thingsToCarry,
      importantNotes: importantNotes,
      coverDeleted: req.body.coverDeleted === 'true' || req.body.coverDeleted === true,
      deletedGallery: deletedGallery
    };

    await trekModel.updateTrek(trekId, trek, req.files);

    res.status(200).json({
      success: true,
      message: "Trek updated successfully",
    });

  } catch (err) {
    console.error('Error updating trek:', err);

    if (err.message === 'BATCHES_HAVE_BOOKINGS') {
      return res.status(409).json({
        success: false,
        message: "Cannot update batches that have existing bookings. Please contact admin.",
        error: "BATCHES_HAVE_BOOKINGS"
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to update trek",
      error: err.message
    });
  }
}

async function getTreks(req,res){
    const conn = await db.getConnection();
  
  try {
    const [treks] = await conn.execute(`
      SELECT 
        t.*,
        COUNT(DISTINCT tb.id) as total_batches,
        COUNT(DISTINCT b.id) as total_bookings,
        SUM(CASE WHEN tb.status = 'active' THEN 1 ELSE 0 END) as active_batches
      FROM treks t
      LEFT JOIN trek_batches tb ON t.id = tb.trek_id
      LEFT JOIN bookings b ON tb.id = b.batch_id AND b.booking_status IN ('pending', 'confirmed')
      GROUP BY t.id
      ORDER BY t.created_at DESC
    `);

    res.json({
      success: true,
      treks: treks
    });
  } catch (error) {
    console.error('Get treks error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch treks',
      error: error.message
    });
  } finally {
    conn.release();
  }
}

async function getBatchesById(req, res) {
  const conn = await db.getConnection();

  try {
    const { trekId } = req.params;

    const [batches] = await conn.execute(`
      SELECT 
        tb.*,
        t.name as trek_name,
        COUNT(b.id) as total_bookings,
        SUM(b.participants) as total_participants,
        SUM(CASE WHEN b.booking_status = 'confirmed' THEN b.participants ELSE 0 END) as confirmed_participants,
        SUM(CASE WHEN b.booking_status = 'pending' THEN b.participants ELSE 0 END) as pending_participants
      FROM trek_batches tb
      INNER JOIN treks t ON tb.trek_id = t.id
      LEFT JOIN bookings b ON tb.id = b.batch_id AND b.booking_status IN ('pending', 'confirmed')
      WHERE tb.trek_id = ?
      GROUP BY tb.id
      ORDER BY tb.start_date ASC
    `, [trekId]);

    res.json({
      success: true,
      batches: batches
    });
  } catch (error) {
    console.error('Get batches error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch batches',
      error: error.message
    });
  } finally {
    conn.release();
  }
}

async function getBookingsById(req,res) {
    const conn = await db.getConnection();
  
  try {
    const { batchId } = req.params;

    const [bookings] = await conn.execute(`
      SELECT 
        b.*,
        t.name as trek_name,
        tb.start_date,
        tb.end_date,
        u.full_name as user_full_name,
        u.email as user_email
      FROM bookings b
      INNER JOIN trek_batches tb ON b.batch_id = tb.id
      INNER JOIN treks t ON tb.trek_id = t.id
      LEFT JOIN users u ON b.user_id = u.id
      WHERE b.batch_id = ?
      ORDER BY b.created_at DESC
    `, [batchId]);

    // Get add-ons for each booking
    for (let booking of bookings) {
      const [addons] = await conn.execute(`
        SELECT addon_name, quantity, unit_price, total_price
        FROM booking_addons
        WHERE booking_id = ?
      `, [booking.id]);
      
      booking.addons = addons;
    }

    res.json({
      success: true,
      bookings: bookings
    });
  } catch (error) {
    console.error('Get bookings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch bookings',
      error: error.message
    });
  } finally {
    conn.release();
  }
}

async function stopBooking(req,res){
    const conn = await db.getConnection();
  
  try {
    const { batchId } = req.params;

    await conn.beginTransaction();

    // Update batch status to 'inactive' or 'full'
    const [result] = await conn.execute(`
      UPDATE trek_batches 
      SET status = 'inactive'
      WHERE id = ?
    `, [batchId]);

    if (result.affectedRows === 0) {
      await conn.rollback();
      return res.status(404).json({
        success: false,
        message: 'Batch not found'
      });
    }

    // Get batch details for response
    const [batch] = await conn.execute(`
      SELECT tb.*, t.name as trek_name
      FROM trek_batches tb
      INNER JOIN treks t ON tb.trek_id = t.id
      WHERE tb.id = ?
    `, [batchId]);

    await conn.commit();

    res.json({
      success: true,
      message: 'Booking stopped successfully for this batch',
      batch: batch[0]
    });
  } catch (error) {
    await conn.rollback();
    console.error('Stop booking error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to stop booking',
      error: error.message
    });
  } finally {
    conn.release();
  }
}

async function resumeBooking(req,res){
    const conn = await db.getConnection();
  
  try {
    const { batchId } = req.params;

    await conn.beginTransaction();

    const [result] = await conn.execute(`
      UPDATE trek_batches 
      SET status = 'active'
      WHERE id = ?
    `, [batchId]);

    if (result.affectedRows === 0) {
      await conn.rollback();
      return res.status(404).json({
        success: false,
        message: 'Batch not found'
      });
    }

    const [batch] = await conn.execute(`
      SELECT tb.*, t.name as trek_name
      FROM trek_batches tb
      INNER JOIN treks t ON tb.trek_id = t.id
      WHERE tb.id = ?
    `, [batchId]);

    await conn.commit();

    res.json({
      success: true,
      message: 'Booking resumed successfully for this batch',
      batch: batch[0]
    });
  } catch (error) {
    await conn.rollback();
    console.error('Resume booking error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to resume booking',
      error: error.message
    });
  } finally {
    conn.release();
  }
}

async function exportBookings(req,res){
    const conn = await db.getConnection();
  
  try {
    const { batchId } = req.params;

    // Get batch details
    const [batchInfo] = await conn.execute(`
      SELECT tb.*, t.name as trek_name
      FROM trek_batches tb
      INNER JOIN treks t ON tb.trek_id = t.id
      WHERE tb.id = ?
    `, [batchId]);

    if (batchInfo.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Batch not found'
      });
    }

    const batch = batchInfo[0];

    // Get all bookings
    const [bookings] = await conn.execute(`
      SELECT 
        b.id,
        b.booking_reference,
        b.customer_name,
        b.customer_email,
        b.customer_phone,
        b.emergency_contact,
        b.participants,
        b.total_amount,
        b.amount_paid,
        b.balance_due,
        b.booking_status,
        b.payment_status,
        b.special_requests,
        b.created_at,
        DATE_FORMAT(b.created_at, '%Y-%m-%d %H:%i:%s') as booking_date
      FROM bookings b
      WHERE b.batch_id = ?
      ORDER BY b.created_at DESC
    `, [batchId]);

    // Get add-ons for each booking
    for (let booking of bookings) {
      const [addons] = await conn.execute(`
        SELECT addon_name, quantity, unit_price, total_price
        FROM booking_addons
        WHERE booking_id = ?
      `, [booking.id]);
      
      booking.addons_list = addons.map(a => 
        `${a.addon_name} (${a.quantity}x₹${a.unit_price})`
      ).join(', ');
    }

    // Prepare data for Excel
    const excelData = bookings.map(booking => ({
      'Booking Reference': booking.booking_reference,
      'Booking Date': booking.booking_date,
      'Customer Name': booking.customer_name,
      'Email': booking.customer_email,
      'Phone': booking.customer_phone,
      'Emergency Contact': booking.emergency_contact,
      'Participants': booking.participants,
      'Base Amount': `₹${parseFloat(booking.total_amount - (booking.addons_list ? 0 : booking.total_amount)).toFixed(2)}`,
      'Add-ons': booking.addons_list || 'None',
      'Total Amount': `₹${parseFloat(booking.total_amount).toFixed(2)}`,
      'Amount Paid': `₹${parseFloat(booking.amount_paid).toFixed(2)}`,
      'Balance Due': `₹${parseFloat(booking.balance_due).toFixed(2)}`,
      'Booking Status': booking.booking_status,
      'Payment Status': booking.payment_status,
      'Special Requests': booking.special_requests || 'None'
    }));

    // Create workbook
    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Bookings');

    // Set column widths for bookings sheet
    const wscols = [
      { wch: 20 }, // Booking Reference
      { wch: 20 }, // Booking Date
      { wch: 25 }, // Customer Name
      { wch: 30 }, // Email
      { wch: 15 }, // Phone
      { wch: 15 }, // Emergency Contact
      { wch: 12 }, // Participants
      { wch: 15 }, // Base Amount
      { wch: 40 }, // Add-ons
      { wch: 15 }, // Total Amount
      { wch: 15 }, // Amount Paid
      { wch: 15 }, // Balance Due
      { wch: 15 }, // Booking Status
      { wch: 15 }, // Payment Status
      { wch: 50 }  // Special Requests
    ];
    worksheet['!cols'] = wscols;

    // Generate buffer
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    // Set response headers
    const fileName = `${batch.trek_name.replace(/\s+/g, '_')}_${new Date(batch.start_date).toISOString().split('T')[0]}_Bookings.xlsx`;
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(buffer);

  } catch (error) {
    console.error('Export bookings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to export bookings',
      error: error.message
    });
  } finally {
    conn.release();
  }
}

async function exportallBookings(req,res){
    const conn = await db.getConnection();
  
  try {
    const { trekId } = req.params;

    // Get trek details
    const [trekInfo] = await conn.execute(`
      SELECT * FROM treks WHERE id = ?
    `, [trekId]);

    if (trekInfo.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Trek not found'
      });
    }

    const trek = trekInfo[0];

    // Get all batches and their bookings
    const [bookings] = await conn.execute(`
      SELECT 
        b.id,
        b.booking_reference,
        b.customer_name,
        b.customer_email,
        b.customer_phone,
        b.emergency_contact,
        b.participants,
        b.total_amount,
        b.amount_paid,
        b.balance_due,
        b.booking_status,
        b.payment_status,
        b.special_requests,
        DATE_FORMAT(b.created_at, '%Y-%m-%d %H:%i:%s') as booking_date,
        DATE_FORMAT(tb.start_date, '%Y-%m-%d') as batch_start_date,
        DATE_FORMAT(tb.end_date, '%Y-%m-%d') as batch_end_date,
        tb.id as batch_id
      FROM bookings b
      INNER JOIN trek_batches tb ON b.batch_id = tb.id
      WHERE tb.trek_id = ?
      ORDER BY tb.start_date, b.created_at
    `, [trekId]);

    // Get add-ons for each booking
    for (let booking of bookings) {
      const [addons] = await conn.execute(`
        SELECT addon_name, quantity, unit_price
        FROM booking_addons
        WHERE booking_id = ?
      `, [booking.id]);
      
      booking.addons_list = addons.map(a => 
        `${a.addon_name} (${a.quantity}x₹${a.unit_price})`
      ).join(', ');
    }

    // Prepare Excel data
    const excelData = bookings.map(booking => ({
      'Batch Date': `${booking.batch_start_date} to ${booking.batch_end_date}`,
      'Booking Reference': booking.booking_reference,
      'Booking Date': booking.booking_date,
      'Customer Name': booking.customer_name,
      'Email': booking.customer_email,
      'Phone': booking.customer_phone,
      'Emergency Contact': booking.emergency_contact,
      'Participants': booking.participants,
      'Add-ons': booking.addons_list || 'None',
      'Total Amount': `₹${parseFloat(booking.total_amount).toFixed(2)}`,
      'Amount Paid': `₹${parseFloat(booking.amount_paid).toFixed(2)}`,
      'Balance Due': `₹${parseFloat(booking.balance_due).toFixed(2)}`,
      'Booking Status': booking.booking_status,
      'Payment Status': booking.payment_status,
      'Special Requests': booking.special_requests || 'None'
    }));

    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'All Bookings');

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    const fileName = `${trek.name.replace(/\s+/g, '_')}_All_Bookings.xlsx`;
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(buffer);

  } catch (error) {
    console.error('Export all bookings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to export bookings',
      error: error.message
    });
  } finally {
    conn.release();
  }
}

module.exports = {
  createTrek,
  getAllTreks,
  getTrekById,
  getTrekByIdToUpdate,
  updateTrek,
  getTreks,
  getBatchesById,
  getBookingsById,
  stopBooking,
  resumeBooking,
  exportBookings,
  exportallBookings
};

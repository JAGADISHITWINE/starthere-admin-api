const trekModel = require("../models/trek");
const db = require("../config/db");
const XLSX = require('xlsx');
const { encrypt, decrypt } = require("../service/cryptoHelper");

async function createTrek(req, res) {
  try {
    if (!req.body?.encryptedPayload) {
      return res.status(400).json({
        success: false,
        message: "Missing payload"
      });
    }

    let trek;
    try {
      trek = decrypt(req.body.encryptedPayload);
    } catch {
      return res.status(400).json({
        success: false,
        message: "Invalid encrypted payload"
      });
    }

    if (!trek.name || !trek.location || !trek.category || !trek.difficulty) {
      return res.status(400).json({
        success: false,
        message: "Missing required trek fields"
      });
    }

    if (!req.files?.coverImage?.length) {
      return res.status(400).json({
        success: false,
        message: "Cover image is required"
      });
    }

    const trekId = await trekModel.createTrek(trek, req.files);

    const encryptedResponse = encrypt({
      success: true,
      message: "Trek created successfully",
      trekId
    });

    res.status(201).json({
      success: true,
      data: encryptedResponse
    });

  } catch (err) {
    if (err.message === "DUPLICATE_TREK") {
      return res.status(409).json({
        success: false,
        data: encrypt({
          success: false,
          message: "Trek already exists"
        })
      });
    }

    console.error("Create trek error:", err);

    res.status(500).json({
      success: false,
      data: encrypt({
        success: false,
        message: "Failed to create trek"
      })
    });
  }
}


async function updateTrek(req, res) {
  try {
    const trekId = Number(req.params.id);

    // Validate trek ID
    if (!trekId || isNaN(trekId)) {
      const errorResponse = encrypt({
        success: false,
        message: "Invalid trek ID",
      });
      
      return res.status(400).json({
        success: false,
        data: errorResponse,
      });
    }

    // Validate request
    if (!req.body || !req.body.encryptedPayload) {
      const errorResponse = encrypt({
        success: false,
        message: "Missing trek data",
      });
      
      return res.status(400).json({
        success: false,
        data: errorResponse,
      });
    }

    // Decrypt the payload
    let trekData;
    try {
      trekData = decrypt(req.body.encryptedPayload);
    } catch (e) {
      console.error("Error decrypting payload:", e);
      
      const errorResponse = encrypt({
        success: false,
        message: "Invalid encrypted payload",
      });
      
      return res.status(400).json({
        success: false,
        data: errorResponse,
      });
    }

    // Parse fields (already parsed from decrypted JSON)
    const highlights = trekData.highlights || [];
    const batches = trekData.batches || [];
    const thingsToCarry = trekData.thingsToCarry || [];
    const importantNotes = trekData.importantNotes || [];
    const deletedGallery = trekData.deletedGallery || [];

    // Build trek object
    const trek = {
      name: trekData.name,
      location: trekData.location,
      difficulty: trekData.difficulty,
      category: trekData.category,
      fitnessLevel: trekData.fitnessLevel || null,
      description: trekData.description || null,
      highlights: highlights,
      batches: batches,
      thingsToCarry: thingsToCarry,
      importantNotes: importantNotes,
      coverDeleted: trekData.coverDeleted === true || trekData.coverDeleted === 'true',
      deletedGallery: deletedGallery,
    };

    // Update trek in database
    await trekModel.updateTrek(trekId, trek, req.files);

    // Prepare success response
    const response = {
      success: true,
      message: "Trek updated successfully",
    };

    // Encrypt response
    const encryptedResponse = encrypt(response);

    res.status(200).json({
      success: true,
      data: encryptedResponse,
    });

  } catch (err) {
    console.error("Error updating trek:", err);

    let errorMessage = "Failed to update trek";
    let statusCode = 500;

    if (err.message === "BATCHES_HAVE_BOOKINGS") {
      errorMessage = "Cannot update batches that have existing bookings. Please contact admin.";
      statusCode = 409;
    }

    const errorResponse = encrypt({
      success: false,
      message: errorMessage,
      error: err.message,
    });

    res.status(statusCode).json({
      success: false,
      data: errorResponse,
    });
  }
}

async function getAllTreks(req, res) {
  const conn = await db.getConnection();

  try {
    /* =======================
       1️⃣ Fetch all treks (summary)
    ======================= */
    const [treks] = await conn.query(`
      SELECT 
        t.id,
        t.name,
        t.location,
        t.category,
        t.difficulty,
        t.fitness_level,
        t.description,
        t.cover_image,
        MIN(b.duration) AS duration,
        MIN(b.start_date) AS earliest_start_date,
        MAX(b.end_date) AS latest_end_date,
        MIN(b.price) AS starting_price,
        MAX(b.price) AS max_price,
        SUM(b.available_slots) AS total_available_slots,
        SUM(b.booked_slots) AS total_booked_slots,
        SUM(b.available_slots - b.booked_slots) AS total_remaining_slots,
        COUNT(DISTINCT b.id) AS total_batches,
        COUNT(DISTINCT CASE WHEN b.status = 'active' THEN b.id END) AS active_batches,
        COUNT(DISTINCT CASE WHEN b.status = 'inactive' THEN b.id END) AS inactive_batches,
        COUNT(DISTINCT CASE WHEN b.status = 'cancelled' THEN b.id END) AS cancelled_batches,
        COUNT(DISTINCT CASE WHEN b.status = 'completed' THEN b.id END) AS completed_batches,
        t.created_at,
        t.updated_at
      FROM treks t
      LEFT JOIN trek_batches b ON b.trek_id = t.id
      GROUP BY t.id
      ORDER BY t.created_at DESC
    `);

    /* =======================
       2️⃣ Fetch all batches
    ======================= */
    const [allBatches] = await conn.query(`
      SELECT 
        id,
        trek_id,
        DATE_FORMAT(start_date, '%Y-%m-%d') AS startDate,
        DATE_FORMAT(end_date, '%Y-%m-%d') AS endDate,
        status,
        price,
        available_slots,
        booked_slots,
        duration,
        (available_slots - booked_slots) AS remainingSlots
      FROM trek_batches
      ORDER BY start_date ASC
    `);

    // Group batches by trek_id
    const batchMap = {};
    for (const batch of allBatches) {
      if (!batchMap[batch.trek_id]) {
        batchMap[batch.trek_id] = [];
      }
      batchMap[batch.trek_id].push(batch);
    }

    /* =======================
       3️⃣ Fetch highlight counts
    ======================= */
    const [highlights] = await conn.query(`
      SELECT trek_id, COUNT(*) AS highlight_count
      FROM trek_highlights
      GROUP BY trek_id
    `);

    const highlightMap = {};
    for (const h of highlights) {
      highlightMap[h.trek_id] = h.highlight_count;
    }

    /* =======================
       4️⃣ Attach everything
    ======================= */
    for (const trek of treks) {
      trek.batches = batchMap[trek.id] || [];
      trek.highlight_count = highlightMap[trek.id] || 0;

      trek.earliest_start_date = trek.earliest_start_date
        ? new Date(trek.earliest_start_date).toISOString().split("T")[0]
        : null;

      trek.latest_end_date = trek.latest_end_date
        ? new Date(trek.latest_end_date).toISOString().split("T")[0]
        : null;

      trek.has_batches = trek.batches.length > 0;
      trek.has_available_slots = trek.batches.some(
        b => b.status === "active" && b.remainingSlots > 0
      );
    }

    /* =======================
       5️⃣ Trek counts
    ======================= */
    const [[totalCount]] = await conn.query(`
      SELECT COUNT(*) AS total_trek_count FROM treks
    `);

    const [[activeCount]] = await conn.query(`
      SELECT COUNT(DISTINCT t.id) AS active_trek_count
      FROM treks t
      JOIN trek_batches b ON b.trek_id = t.id
      WHERE b.status = 'active'
        AND b.start_date >= CURDATE()
        AND (b.available_slots - b.booked_slots) > 0
    `);

    /* =======================
       6️⃣ Response
    ======================= */
    const response = {
      count: treks.length,
      totalTreks: totalCount.total_trek_count,
      activeTrekCount: activeCount.active_trek_count,
      result: treks
    };

    const encryptedResponse = encrypt(response);

    res.status(200).json({
      success: true,
      data: encryptedResponse
    });

  } catch (err) {
    console.error("Error fetching treks:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch treks",
      error: err.message
    });
  } finally {
    conn.release();
  }
}

async function getTrekById(req, res) {
  const batchId = req.params.id;  // ✅ Accepting batch_id
  const conn = await db.getConnection();

  try {
    // ✅ First, get the batch to find the trek_id
    const [[batch]] = await conn.query(
      `SELECT 
        id AS batchId, 
        trek_id AS trekId, 
        start_date AS startDate, 
        end_date AS endDate, 
        available_slots AS availableSlots, 
        booked_slots AS bookedSlots,
        (available_slots - booked_slots) AS remainingSlots,
        price, 
        min_age AS minAge, 
        max_age AS maxAge, 
        min_participants AS minParticipants, 
        max_participants AS maxParticipants, 
        duration, 
        status,
        CASE 
          WHEN status != 'active' THEN 'inactive'
          WHEN (available_slots - booked_slots) <= 0 THEN 'sold-out'
          WHEN (available_slots - booked_slots) <= 3 THEN 'last-seat'
          WHEN (available_slots - booked_slots) <= 10 THEN 'selling-fast'
          ELSE 'available'
        END AS slotStatus
      FROM trek_batches 
      WHERE id = ?`,
      [batchId]
    );

    if (!batch) {
      return res.status(404).json({
        success: false,
        message: 'Batch not found'
      });
    }

    const trekId = batch.trekId;

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

    // ✅ Get inclusions for this batch - USING batch.batchId to be safe
    const [inclusions] = await conn.query(
      "SELECT inclusion FROM batch_inclusions WHERE batch_id = ? ORDER BY id",
      [batch.batchId],
    );
    batch.inclusions = inclusions.map((i) => i.inclusion);

    // ✅ Get exclusions for this batch - USING batch.batchId to be safe
    const [exclusions] = await conn.query(
      "SELECT exclusion FROM batch_exclusions WHERE batch_id = ? ORDER BY id",
      [batch.batchId],
    );
    batch.exclusions = exclusions.map((e) => e.exclusion);

    // ✅ Get itinerary days for this batch
    const [days] = await conn.query(
      "SELECT id, day_number AS dayNumber, title FROM itinerary_days WHERE batch_id = ? ORDER BY day_number",
      [batch.batchId],
    );

    // For each day, get activities
    for (const day of days) {
      const [activities] = await conn.query(
        "SELECT activity_time AS activityTime, activity_text AS activityText FROM itinerary_activities WHERE day_id = ? ORDER BY activity_time",
        [day.id],
      );
      day.activities = activities;

      // Remove internal id from response
      delete day.id;
    }

    batch.itineraryDays = days;

    // ✅ Attach only this batch to trek
    trek.batch = batch;

    const response = trek;

    const encryptedResponse = encrypt(response);

    // Send response
    res.status(200).json({
      success: true,
      data: encryptedResponse
    });

  } catch (err) {
    console.error('Error fetching trek by batch:', err);
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

    response = {
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
    }

    const encryptedResponse = encrypt(response);

    // Build response
    res.status(200).json({
      success: true,
      data: encryptedResponse,
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

async function getTreks(req, res) {
  const conn = await db.getConnection();

  try {
    const [treks] = await conn.execute(`
      SELECT 
        t.*,
        COUNT(DISTINCT tb.id) as total_batches,
        COUNT(DISTINCT b.id) as total_bookings,
        SUM(CASE WHEN tb.status = 'active' THEN 1 ELSE 0 END) as active_batches
      FROM treks t
      LEFT JOIN trek_batches tb ON t.id = tb.trek_id AND tb.status IN ('active','full','inactive')
      LEFT JOIN bookings b ON tb.id = b.batch_id AND b.booking_status IN ('pending', 'confirmed')
      GROUP BY t.id
      ORDER BY t.created_at DESC
    `);

    const encryptedResponse = encrypt(treks);

    res.json({
      success: true,
      data: encryptedResponse
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
      INNER JOIN treks t ON tb.trek_id = t.id AND tb.status IN ('active','full','inactive')
      LEFT JOIN bookings b ON tb.id = b.batch_id AND b.booking_status IN ('pending', 'confirmed')
      WHERE tb.trek_id = ?
      GROUP BY tb.id
      ORDER BY tb.start_date ASC
    `, [trekId]);

    const encryptedResponse = encrypt(batches);

    res.json({
      success: true,
      data: encryptedResponse
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

async function getBookingsById(req, res) {
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

    // Get add-ons and participants for each booking
    for (let booking of bookings) {
      // Get add-ons
      const [addons] = await conn.execute(`
        SELECT addon_name, quantity, unit_price, total_price
        FROM booking_addons
        WHERE booking_id = ?
      `, [booking.id]);

      booking.addons = addons;

      // Get participants
      const [participants] = await conn.execute(`
        SELECT 
          id,
          name,
          age,
          gender,
          id_type,
          id_number,
          phone,
          medical_info,
          is_primary_contact
        FROM booking_participants
        WHERE booking_id = ?
        ORDER BY is_primary_contact DESC, id ASC
      `, [booking.id]);

      booking.participants_details = participants;
    }

    const encryptedResponse = encrypt(bookings);

    res.json({
      success: true,
      data: encryptedResponse
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

async function stopBooking(req, res) {
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

async function resumeBooking(req, res) {
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

async function exportBookings(req, res) {
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

    // Get add-ons and participants for each booking
    for (let booking of bookings) {
      // Get add-ons
      const [addons] = await conn.execute(`
        SELECT addon_name, quantity, unit_price, total_price
        FROM booking_addons
        WHERE booking_id = ?
      `, [booking.id]);

      booking.addons_list = addons.map(a =>
        `${a.addon_name} (${a.quantity}x₹${a.unit_price})`
      ).join(', ');

      // Get participants
      const [participants] = await conn.execute(`
        SELECT 
          name,
          age,
          gender,
          id_type,
          id_number,
          phone,
          medical_info,
          is_primary_contact
        FROM booking_participants
        WHERE booking_id = ?
        ORDER BY is_primary_contact DESC, id ASC
      `, [booking.id]);

      booking.participants_details = participants;
    }

    // ============================================
    // SHEET 1: Bookings Summary
    // ============================================
    const bookingsData = bookings.map(booking => ({
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

    // ============================================
    // SHEET 2: All Participants
    // ============================================
    const participantsData = [];

    bookings.forEach(booking => {
      if (booking.participants_details && booking.participants_details.length > 0) {
        booking.participants_details.forEach((participant, index) => {
          participantsData.push({
            'Booking Reference': booking.booking_reference,
            'Customer Name': booking.customer_name,
            'Participant #': index + 1,
            'Participant Name': participant.name,
            'Age': participant.age || '-',
            'Gender': participant.gender || '-',
            'ID Type': participant.id_type || '-',
            'ID Number': participant.id_number || '-',
            'Phone': participant.phone || '-',
            'Medical Info': participant.medical_info || 'None',
            'Primary Contact': participant.is_primary_contact ? 'Yes' : 'No',
            'Booking Status': booking.booking_status
          });
        });
      }
    });

    // ============================================
    // Create Excel Workbook
    // ============================================
    const workbook = XLSX.utils.book_new();

    // Add Bookings sheet
    const bookingsSheet = XLSX.utils.json_to_sheet(bookingsData);
    bookingsSheet['!cols'] = [
      { wch: 20 }, // Booking Reference
      { wch: 20 }, // Booking Date
      { wch: 25 }, // Customer Name
      { wch: 30 }, // Email
      { wch: 15 }, // Phone
      { wch: 15 }, // Emergency Contact
      { wch: 12 }, // Participants
      { wch: 40 }, // Add-ons
      { wch: 15 }, // Total Amount
      { wch: 15 }, // Amount Paid
      { wch: 15 }, // Balance Due
      { wch: 15 }, // Booking Status
      { wch: 15 }, // Payment Status
      { wch: 50 }  // Special Requests
    ];
    XLSX.utils.book_append_sheet(workbook, bookingsSheet, 'Bookings');

    // Add Participants sheet
    if (participantsData.length > 0) {
      const participantsSheet = XLSX.utils.json_to_sheet(participantsData);
      participantsSheet['!cols'] = [
        { wch: 20 }, // Booking Reference
        { wch: 25 }, // Customer Name
        { wch: 12 }, // Participant #
        { wch: 25 }, // Participant Name
        { wch: 8 },  // Age
        { wch: 10 }, // Gender
        { wch: 20 }, // ID Type
        { wch: 20 }, // ID Number
        { wch: 15 }, // Phone
        { wch: 40 }, // Medical Info
        { wch: 15 }, // Primary Contact
        { wch: 15 }  // Booking Status
      ];
      XLSX.utils.book_append_sheet(workbook, participantsSheet, 'All Participants');
    }

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

async function exportallBookings(req, res) {
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

    // Get add-ons and participants for each booking
    for (let booking of bookings) {
      // Get add-ons
      const [addons] = await conn.execute(`
        SELECT addon_name, quantity, unit_price
        FROM booking_addons
        WHERE booking_id = ?
      `, [booking.id]);

      booking.addons_list = addons.map(a =>
        `${a.addon_name} (${a.quantity}x₹${a.unit_price})`
      ).join(', ');

      // Get participants
      const [participants] = await conn.execute(`
        SELECT 
          name,
          age,
          gender,
          id_type,
          id_number,
          phone,
          medical_info,
          is_primary_contact
        FROM booking_participants
        WHERE booking_id = ?
        ORDER BY is_primary_contact DESC, id ASC
      `, [booking.id]);

      booking.participants_details = participants;
    }

    // ============================================
    // SHEET 1: Bookings Summary
    // ============================================
    const bookingsData = bookings.map(booking => ({
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

    // ============================================
    // SHEET 2: All Participants (across all batches)
    // ============================================
    const participantsData = [];

    bookings.forEach(booking => {
      if (booking.participants_details && booking.participants_details.length > 0) {
        booking.participants_details.forEach((participant, index) => {
          participantsData.push({
            'Batch Date': `${booking.batch_start_date} to ${booking.batch_end_date}`,
            'Booking Reference': booking.booking_reference,
            'Customer Name': booking.customer_name,
            'Participant #': index + 1,
            'Participant Name': participant.name,
            'Age': participant.age || '-',
            'Gender': participant.gender || '-',
            'ID Type': participant.id_type || '-',
            'ID Number': participant.id_number || '-',
            'Phone': participant.phone || '-',
            'Medical Info': participant.medical_info || 'None',
            'Primary Contact': participant.is_primary_contact ? 'Yes' : 'No',
            'Booking Status': booking.booking_status,
            'Payment Status': booking.payment_status
          });
        });
      }
    });

    // ============================================
    // SHEET 3: Summary Statistics
    // ============================================
    const totalBookings = bookings.length;
    const totalParticipants = participantsData.length;
    const totalRevenue = bookings.reduce((sum, b) => sum + parseFloat(b.total_amount), 0);
    const totalPaid = bookings.reduce((sum, b) => sum + parseFloat(b.amount_paid), 0);
    const totalPending = bookings.reduce((sum, b) => sum + parseFloat(b.balance_due), 0);

    const confirmedBookings = bookings.filter(b => b.booking_status === 'confirmed').length;
    const pendingBookings = bookings.filter(b => b.booking_status === 'pending').length;
    const cancelledBookings = bookings.filter(b => b.booking_status === 'cancelled').length;

    const summaryData = [
      { 'Metric': 'Trek Name', 'Value': trek.name },
      { 'Metric': 'Total Bookings', 'Value': totalBookings },
      { 'Metric': 'Total Participants', 'Value': totalParticipants },
      { 'Metric': '', 'Value': '' },
      { 'Metric': 'Confirmed Bookings', 'Value': confirmedBookings },
      { 'Metric': 'Pending Bookings', 'Value': pendingBookings },
      { 'Metric': 'Cancelled Bookings', 'Value': cancelledBookings },
      { 'Metric': '', 'Value': '' },
      { 'Metric': 'Total Revenue', 'Value': `₹${totalRevenue.toFixed(2)}` },
      { 'Metric': 'Total Paid', 'Value': `₹${totalPaid.toFixed(2)}` },
      { 'Metric': 'Total Pending', 'Value': `₹${totalPending.toFixed(2)}` },
      { 'Metric': '', 'Value': '' },
      { 'Metric': 'Report Generated', 'Value': new Date().toLocaleString('en-IN') }
    ];

    // ============================================
    // Create Excel Workbook
    // ============================================
    const workbook = XLSX.utils.book_new();

    // Add Summary sheet (first)
    const summarySheet = XLSX.utils.json_to_sheet(summaryData);
    summarySheet['!cols'] = [
      { wch: 25 }, // Metric
      { wch: 30 }  // Value
    ];
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');

    // Add Bookings sheet
    const bookingsSheet = XLSX.utils.json_to_sheet(bookingsData);
    bookingsSheet['!cols'] = [
      { wch: 25 }, // Batch Date
      { wch: 20 }, // Booking Reference
      { wch: 20 }, // Booking Date
      { wch: 25 }, // Customer Name
      { wch: 30 }, // Email
      { wch: 15 }, // Phone
      { wch: 15 }, // Emergency Contact
      { wch: 12 }, // Participants
      { wch: 40 }, // Add-ons
      { wch: 15 }, // Total Amount
      { wch: 15 }, // Amount Paid
      { wch: 15 }, // Balance Due
      { wch: 15 }, // Booking Status
      { wch: 15 }, // Payment Status
      { wch: 50 }  // Special Requests
    ];
    XLSX.utils.book_append_sheet(workbook, bookingsSheet, 'All Bookings');

    // Add Participants sheet
    if (participantsData.length > 0) {
      const participantsSheet = XLSX.utils.json_to_sheet(participantsData);
      participantsSheet['!cols'] = [
        { wch: 25 }, // Batch Date
        { wch: 20 }, // Booking Reference
        { wch: 25 }, // Customer Name
        { wch: 12 }, // Participant #
        { wch: 25 }, // Participant Name
        { wch: 8 },  // Age
        { wch: 10 }, // Gender
        { wch: 20 }, // ID Type
        { wch: 20 }, // ID Number
        { wch: 15 }, // Phone
        { wch: 40 }, // Medical Info
        { wch: 15 }, // Primary Contact
        { wch: 15 }, // Booking Status
        { wch: 15 }  // Payment Status
      ];
      XLSX.utils.book_append_sheet(workbook, participantsSheet, 'All Participants');
    }

    // Generate buffer
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    // Set response headers
    const fileName = `${trek.name.replace(/\s+/g, '_')}_All_Bookings_${new Date().toISOString().split('T')[0]}.xlsx`;

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
  updateTrek,
  getAllTreks,
  getTrekById,
  getTrekByIdToUpdate,
  getTreks,
  getBatchesById,
  getBookingsById,
  stopBooking,
  resumeBooking,
  exportBookings,
  exportallBookings
};

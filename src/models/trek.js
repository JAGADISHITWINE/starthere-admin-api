const db = require('../config/db');

async function createTrek(trek, files) {
  const conn = await db.getConnection();

  try {
    // 🔁 Duplicate check
    const [[exists]] = await conn.query(
      'SELECT id FROM treks WHERE name = ? AND location = ?',
      [trek.name, trek.location]
    );

    if (exists) {
      throw new Error('DUPLICATE_TREK');
    }

    await conn.beginTransaction();

    // ✅ INSERT TREK
    const [result] = await conn.query(
      `INSERT INTO treks (
        name,
        location,
        category,
        difficulty,
        fitness_level,
        description,
        cover_image,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        trek.name,
        trek.location,
        trek.category,
        trek.difficulty,
        trek.fitnessLevel || null,
        trek.description || null,
        files?.coverImage?.[0]?.path || files?.coverImage?.[0]?.filename || null
      ]
    );

    const trekId = result.insertId;

    // 🌟 Insert Highlights
    if (Array.isArray(trek.highlights) && trek.highlights.length > 0) {
      for (const highlight of trek.highlights.filter(Boolean)) {
        await conn.query(
          'INSERT INTO trek_highlights (trek_id, highlight) VALUES (?, ?)',
          [trekId, highlight]
        );
      }
    }

    // 🎒 Insert Things to Carry
    if (Array.isArray(trek.thingsToCarry) && trek.thingsToCarry.length > 0) {
      for (let i = 0; i < trek.thingsToCarry.length; i++) {
        const item = trek.thingsToCarry[i];
        if (item) {
          await conn.query(
            'INSERT INTO trek_things_to_carry (trek_id, item, display_order) VALUES (?, ?, ?)',
            [trekId, item, i + 1]
          );
        }
      }
    }

    // ⚠️ Insert Important Notes
    if (Array.isArray(trek.importantNotes) && trek.importantNotes.length > 0) {
      for (let i = 0; i < trek.importantNotes.length; i++) {
        const note = trek.importantNotes[i];
        if (note) {
          await conn.query(
            'INSERT INTO trek_important_notes (trek_id, note, display_order) VALUES (?, ?, ?)',
            [trekId, note, i + 1]
          );
        }
      }
    }

    // 📦 Insert Batches with their inclusions, exclusions, and itinerary
    if (Array.isArray(trek.batches) && trek.batches.length > 0) {
      for (const batch of trek.batches) {
        // Insert batch
        const [batchResult] = await conn.query(
          `INSERT INTO trek_batches (
            trek_id,
            start_date,
            end_date,
            available_slots,
            price,
            min_age,
            max_age,
            min_participants,
            max_participants,
            duration,
            status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            trekId,
            batch.startDate,
            batch.endDate,
            batch.availableSlots,
            batch.price,
            batch.minAge || null,
            batch.maxAge || null,
            batch.minParticipants || null,
            batch.maxParticipants || null,
            batch.duration || null,
            batch.batchStatus || 'active'
          ]
        );

        const batchId = batchResult.insertId;

        // Insert batch inclusions (already an array, no need to parse)
        if (Array.isArray(batch.inclusions) && batch.inclusions.length > 0) {
          for (const inclusion of batch.inclusions.filter(Boolean)) {
            await conn.query(
              'INSERT INTO batch_inclusions (batch_id, inclusion) VALUES (?, ?)',
              [batchId, inclusion]
            );
          }
        }

        // Insert batch exclusions (already an array, no need to parse)
        if (Array.isArray(batch.exclusions) && batch.exclusions.length > 0) {
          for (const exclusion of batch.exclusions.filter(Boolean)) {
            await conn.query(
              'INSERT INTO batch_exclusions (batch_id, exclusion) VALUES (?, ?)',
              [batchId, exclusion]
            );
          }
        }

        // 🗺️ Insert Itinerary Days (already an array, no need to parse)
        if (Array.isArray(batch.itineraryDays) && batch.itineraryDays.length > 0) {
          for (const day of batch.itineraryDays) {
            // Insert day
            const [dayResult] = await conn.query(
              `INSERT INTO itinerary_days (
                batch_id,
                day_number,
                title
              ) VALUES (?, ?, ?)`,
              [batchId, day.dayNumber, day.title]
            );

            const dayId = dayResult.insertId;

            // Insert activities for this day (already an array, no need to parse)
            if (Array.isArray(day.activities) && day.activities.length > 0) {
              for (const activity of day.activities) {
                await conn.query(
                  `INSERT INTO itinerary_activities (
                    day_id,
                    activity_time,
                    activity_text
                  ) VALUES (?, ?, ?)`,
                  [dayId, activity.activityTime, activity.activityText]
                );
              }
            }
          }
        }
      }
    }

    // 🖼️ Insert Gallery Images
    if (files?.gallery?.length) {
      for (const img of files.gallery) {
        await conn.query(
          'INSERT INTO trek_images (trek_id, image_url) VALUES (?, ?)',
          [trekId, img.path || img.filename]
        );
      }
    }

    await conn.commit();
    return trekId;

  } catch (err) {
    await conn.rollback();
    console.error('Database error:', err);
    throw err;
  } finally {
    conn.release();
  }
}

async function updateTrek(trekId, trek, files) {
  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    // ========== UPDATE BASIC TREK INFO ==========
    let coverImageValue = undefined;

    if (files?.coverImage?.length) {
      coverImageValue = files.coverImage[0].path || files.coverImage[0].filename;
    } else if (trek.coverDeleted === true) {
      coverImageValue = null;
    }

    let updateQuery = `
      UPDATE treks SET
        name = ?,
        location = ?,
        category = ?,
        difficulty = ?,
        fitness_level = ?,
        description = ?,
        updated_at = NOW()
    `;

    const params = [
      trek.name,
      trek.location,
      trek.category,
      trek.difficulty,
      trek.fitnessLevel,
      trek.description
    ];

    if (coverImageValue !== undefined) {
      updateQuery += `, cover_image = ?`;
      params.push(coverImageValue);
    }

    updateQuery += ` WHERE id = ?`;
    params.push(trekId);

    await conn.query(updateQuery, params);

    // ========== DELETE OLD DATA (safe to delete) ==========
    await conn.query(`DELETE FROM trek_highlights WHERE trek_id = ?`, [trekId]);
    await conn.query(`DELETE FROM trek_things_to_carry WHERE trek_id = ?`, [trekId]);
    await conn.query(`DELETE FROM trek_important_notes WHERE trek_id = ?`, [trekId]);

    // ========== INSERT HIGHLIGHTS ==========
    if (Array.isArray(trek.highlights) && trek.highlights.length > 0) {
      for (const highlight of trek.highlights.filter(Boolean)) {
        await conn.query(
          'INSERT INTO trek_highlights (trek_id, highlight) VALUES (?, ?)',
          [trekId, highlight]
        );
      }
    }

    // ========== INSERT THINGS TO CARRY ==========
    if (Array.isArray(trek.thingsToCarry) && trek.thingsToCarry.length > 0) {
      for (let i = 0; i < trek.thingsToCarry.length; i++) {
        const item = trek.thingsToCarry[i];
        if (item) {
          await conn.query(
            'INSERT INTO trek_things_to_carry (trek_id, item, display_order) VALUES (?, ?, ?)',
            [trekId, item, i + 1]
          );
        }
      }
    }

    // ========== INSERT IMPORTANT NOTES ==========
    if (Array.isArray(trek.importantNotes) && trek.importantNotes.length > 0) {
      for (let i = 0; i < trek.importantNotes.length; i++) {
        const note = trek.importantNotes[i];
        if (note) {
          await conn.query(
            'INSERT INTO trek_important_notes (trek_id, note, display_order) VALUES (?, ?, ?)',
            [trekId, note, i + 1]
          );
        }
      }
    }

    // ========== HANDLE BATCHES (UPDATE APPROACH) ==========
    // Get existing batch IDs
    const [existingBatches] = await conn.query(
      'SELECT id FROM trek_batches WHERE trek_id = ?',
      [trekId]
    );
    const existingBatchIds = existingBatches.map(b => b.id);

    // Track which batches to keep
    const batchesToKeep = [];

    if (Array.isArray(trek.batches) && trek.batches.length > 0) {
      for (let i = 0; i < trek.batches.length; i++) {
        const batch = trek.batches[i];
        
        if (i < existingBatchIds.length) {
          // Update existing batch
          const batchId = existingBatchIds[i];
          batchesToKeep.push(batchId);

          await conn.query(
            `UPDATE trek_batches SET
              start_date = ?,
              end_date = ?,
              available_slots = ?,
              price = ?,
              min_age = ?,
              max_age = ?,
              min_participants = ?,
              max_participants = ?,
              duration = ?,
              status = ?
            WHERE id = ?`,
            [
              batch.startDate,
              batch.endDate,
              batch.availableSlots || null,
              batch.price || null,
              batch.minAge || null,
              batch.maxAge || null,
              batch.minParticipants || null,
              batch.maxParticipants || null,
              batch.duration || null,
              batch.batchStatus || 'active',
              batchId
            ]
          );

          // Delete and recreate nested data (inclusions, exclusions, itinerary)
          await conn.query('DELETE FROM batch_inclusions WHERE batch_id = ?', [batchId]);
          await conn.query('DELETE FROM batch_exclusions WHERE batch_id = ?', [batchId]);
          
          // Delete itinerary (cascades to activities)
          await conn.query('DELETE FROM itinerary_days WHERE batch_id = ?', [batchId]);

          // Insert new nested data
          await insertBatchNestedData(conn, batchId, batch);

        } else {
          // Insert new batch
          const newBatchId = await insertBatch(conn, trekId, batch);
          batchesToKeep.push(newBatchId);
        }
      }
    }

    // Delete batches that are no longer needed (only if they have no bookings)
    const batchesToDelete = existingBatchIds.filter(id => !batchesToKeep.includes(id));
    
    for (const batchId of batchesToDelete) {
      // Check if batch has bookings
      const [[bookingCheck]] = await conn.query(
        'SELECT COUNT(*) as count FROM bookings WHERE batch_id = ?',
        [batchId]
      );

      if (bookingCheck.count === 0) {
        // Safe to delete
        await conn.query('DELETE FROM trek_batches WHERE id = ?', [batchId]);
      } else {
        // Mark as inactive instead of deleting
        await conn.query(
          'UPDATE trek_batches SET status = ? WHERE id = ?',
          ['inactive', batchId]
        );
      }
    }

    // ========== DELETE GALLERY IMAGES ==========
    if (Array.isArray(trek.deletedGallery) && trek.deletedGallery.length > 0) {
      for (const filename of trek.deletedGallery) {
        await conn.query(
          `DELETE FROM trek_images WHERE trek_id = ? AND image_url = ?`,
          [trekId, filename]
        );
      }
    }

    // ========== ADD NEW GALLERY IMAGES ==========
    if (files?.gallery?.length) {
      for (const img of files.gallery) {
        await conn.query(
          `INSERT INTO trek_images (trek_id, image_url) VALUES (?, ?)`,
          [trekId, img.path || img.filename]
        );
      }
    }

    await conn.commit();
    return true;

  } catch (err) {
    await conn.rollback();
    console.error('Database error in updateTrek:', err);
    throw err;
  } finally {
    conn.release();
  }
}

// Helper function to insert nested batch data (inclusions, exclusions, itinerary)
async function insertBatchNestedData(conn, batchId, batch) {
  // Insert inclusions
  if (Array.isArray(batch.inclusions) && batch.inclusions.length > 0) {
    for (const inclusion of batch.inclusions.filter(Boolean)) {
      await conn.query(
        'INSERT INTO batch_inclusions (batch_id, inclusion) VALUES (?, ?)',
        [batchId, inclusion]
      );
    }
  }

  // Insert exclusions
  if (Array.isArray(batch.exclusions) && batch.exclusions.length > 0) {
    for (const exclusion of batch.exclusions.filter(Boolean)) {
      await conn.query(
        'INSERT INTO batch_exclusions (batch_id, exclusion) VALUES (?, ?)',
        [batchId, exclusion]
      );
    }
  }

  // Insert itinerary days
  if (Array.isArray(batch.itineraryDays) && batch.itineraryDays.length > 0) {
    for (const day of batch.itineraryDays) {
      const [dayResult] = await conn.query(
        `INSERT INTO itinerary_days (batch_id, day_number, title) VALUES (?, ?, ?)`,
        [batchId, day.dayNumber, day.title]
      );

      const dayId = dayResult.insertId;

      // Insert activities
      if (Array.isArray(day.activities) && day.activities.length > 0) {
        for (const activity of day.activities) {
          await conn.query(
            `INSERT INTO itinerary_activities (day_id, activity_time, activity_text) VALUES (?, ?, ?)`,
            [dayId, activity.activityTime, activity.activityText]
          );
        }
      }
    }
  }
}

// Helper function to insert a complete new batch
async function insertBatch(conn, trekId, batch) {
  const [batchResult] = await conn.query(
    `INSERT INTO trek_batches (
      trek_id,
      start_date,
      end_date,
      available_slots,
      price,
      min_age,
      max_age,
      min_participants,
      max_participants,
      duration,
      status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      trekId,
      batch.startDate,
      batch.endDate,
      batch.availableSlots || null,
      batch.price || null,
      batch.minAge || null,
      batch.maxAge || null,
      batch.minParticipants || null,
      batch.maxParticipants || null,
      batch.duration || null,
      batch.batchStatus || 'active'
    ]
  );

  const batchId = batchResult.insertId;

  // Insert nested data
  await insertBatchNestedData(conn, batchId, batch);

  return batchId;
}

module.exports = { createTrek, updateTrek };

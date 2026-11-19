package com.pixra.arca.autofill

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.util.Log

data class VaultItemSummary(
  val id: String,
  val vaultId: String?,
  val title: String,
  val username: String?,
  val ciphertext: String,
  val nonce: String,
  val itemType: String
)

class ArcaVaultDbHelper(private val context: Context) {

  companion object {
    private const val TAG = "ArcaVaultDbHelper"
    private const val DB_NAME = "arca_vault.db"
  }

  private fun openReadableDb(): SQLiteDatabase? {
    val dbPath = context.getDatabasePath(DB_NAME)
    if (!dbPath.exists()) {
      Log.d(TAG, "Vault DB does not exist yet at: ${dbPath.absolutePath}")
      return null
    }
    return try {
      SQLiteDatabase.openDatabase(dbPath.absolutePath, null, SQLiteDatabase.OPEN_READONLY)
    } catch (e: Exception) {
      Log.e(TAG, "Error opening readable vault DB: ${e.message}", e)
      null
    }
  }

  private fun openWritableDb(): SQLiteDatabase? {
    val dbPath = context.getDatabasePath(DB_NAME)
    if (!dbPath.exists()) {
      Log.d(TAG, "Vault DB does not exist yet at: ${dbPath.absolutePath}")
      return null
    }
    return try {
      SQLiteDatabase.openDatabase(dbPath.absolutePath, null, SQLiteDatabase.OPEN_READWRITE)
    } catch (e: Exception) {
      Log.e(TAG, "Error opening writable vault DB: ${e.message}", e)
      null
    }
  }

  /**
   * Searches vault items matching incoming query term (package name fragment or web domain).
   */
  fun searchCredentials(query: String?): List<VaultItemSummary> {
    val db = openReadableDb() ?: return emptyList()
    val results = mutableListOf<VaultItemSummary>()

    try {
      if (!query.isNullOrBlank()) {
        val cleanQuery = query.trim().lowercase()
        val wildcard = "%$cleanQuery%"

        val cursor = db.rawQuery(
          """
          SELECT id, vault_id, title, username, ciphertext, nonce, item_type 
          FROM vault_items 
          WHERE is_deleted = 0 AND (LOWER(title) LIKE ? OR LOWER(username) LIKE ?)
          ORDER BY updated_at DESC LIMIT 5
          """.trimIndent(),
          arrayOf(wildcard, wildcard)
        )

        cursor.use { c ->
          while (c.moveToNext()) {
            results.add(
              VaultItemSummary(
                id = c.getString(c.getColumnIndexOrThrow("id")),
                vaultId = c.getString(c.getColumnIndexOrThrow("vault_id")),
                title = c.getString(c.getColumnIndexOrThrow("title")),
                username = c.getString(c.getColumnIndexOrThrow("username")),
                ciphertext = c.getString(c.getColumnIndexOrThrow("ciphertext")),
                nonce = c.getString(c.getColumnIndexOrThrow("nonce")),
                itemType = c.getString(c.getColumnIndexOrThrow("item_type")) ?: "login"
              )
            )
          }
        }
      }

      // If no exact match found, return top recent credentials as fallback
      if (results.isEmpty()) {
        val cursor = db.rawQuery(
          """
          SELECT id, vault_id, title, username, ciphertext, nonce, item_type 
          FROM vault_items 
          WHERE is_deleted = 0 
          ORDER BY updated_at DESC LIMIT 3
          """.trimIndent(),
          null
        )

        cursor.use { c ->
          while (c.moveToNext()) {
            results.add(
              VaultItemSummary(
                id = c.getString(c.getColumnIndexOrThrow("id")),
                vaultId = c.getString(c.getColumnIndexOrThrow("vault_id")),
                title = c.getString(c.getColumnIndexOrThrow("title")),
                username = c.getString(c.getColumnIndexOrThrow("username")),
                ciphertext = c.getString(c.getColumnIndexOrThrow("ciphertext")),
                nonce = c.getString(c.getColumnIndexOrThrow("nonce")),
                itemType = c.getString(c.getColumnIndexOrThrow("item_type")) ?: "login"
              )
            )
          }
        }
      }
    } catch (e: Exception) {
      Log.e(TAG, "Failed to search vault items: ${e.message}", e)
    } finally {
      try {
        db.close()
      } catch (_: Exception) {}
    }

    return results
  }

  fun getActiveVaultId(): String {
    val db = openReadableDb() ?: return "vault_personal"
    try {
      val cursor = db.rawQuery(
        "SELECT id FROM vaults ORDER BY created_at ASC LIMIT 1",
        null
      )
      cursor.use { c ->
        if (c.moveToFirst()) {
          return c.getString(0)
        }
      }
    } catch (e: Exception) {
      Log.e(TAG, "Error fetching active vault ID: ${e.message}", e)
    } finally {
      try {
        db.close()
      } catch (_: Exception) {}
    }
    return "vault_personal"
  }

  fun saveVaultItem(
    title: String,
    username: String,
    ciphertextB64: String,
    nonceB64: String,
    vaultId: String?
  ): Boolean {
    val db = openWritableDb() ?: return false
    return try {
      val itemId = "item_" + System.currentTimeMillis().toString(36) + "_" + (1000..9999).random()
      val now = System.currentTimeMillis()
      val values = ContentValues().apply {
        put("id", itemId)
        put("vault_id", vaultId ?: getActiveVaultId())
        put("title", title)
        put("username", username)
        put("ciphertext", ciphertextB64)
        put("nonce", nonceB64)
        put("tag", "")
        put("hlc", "$now:0:mobile-autofill")
        put("updated_at", now)
        put("is_deleted", 0)
        put("item_type", "login")
      }
      val res = db.insertWithOnConflict("vault_items", null, values, SQLiteDatabase.CONFLICT_REPLACE)
      res != -1L
    } catch (e: Exception) {
      Log.e(TAG, "Failed to save vault item: ${e.message}", e)
      false
    } finally {
      try {
        db.close()
      } catch (_: Exception) {}
    }
  }
}


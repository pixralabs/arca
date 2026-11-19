package com.pixra.arca.autofill

import java.security.SecureRandom

object ArcaPasswordGenerator {
  private val UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
  private val LOWER = "abcdefghijklmnopqrstuvwxyz"
  private val DIGITS = "0123456789"
  private val SYMBOLS = "!@#$%^&*()-_=+[]{}|;:,.<>?"
  private val ALL = UPPER + LOWER + DIGITS + SYMBOLS
  private val random = SecureRandom()

  fun generate(length: Int = 20): String {
    val chars = ArrayList<Char>(length)
    // Guarantee at least two of each character class
    chars.add(UPPER[random.nextInt(UPPER.length)])
    chars.add(UPPER[random.nextInt(UPPER.length)])
    chars.add(LOWER[random.nextInt(LOWER.length)])
    chars.add(LOWER[random.nextInt(LOWER.length)])
    chars.add(DIGITS[random.nextInt(DIGITS.length)])
    chars.add(DIGITS[random.nextInt(DIGITS.length)])
    chars.add(SYMBOLS[random.nextInt(SYMBOLS.length)])
    chars.add(SYMBOLS[random.nextInt(SYMBOLS.length)])

    for (i in chars.size until length) {
      chars.add(ALL[random.nextInt(ALL.length)])
    }

    // Fisher-Yates shuffle
    for (i in chars.indices.reversed()) {
      val j = random.nextInt(i + 1)
      val temp = chars[i]
      chars[i] = chars[j]
      chars[j] = temp
    }

    return chars.joinToString("")
  }
}


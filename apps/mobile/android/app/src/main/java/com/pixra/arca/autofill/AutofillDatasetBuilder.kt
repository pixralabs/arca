package com.pixra.arca.autofill

import android.content.Context
import android.os.Build
import android.service.autofill.Dataset
import android.view.autofill.AutofillId
import android.view.autofill.AutofillValue
import android.widget.RemoteViews
import androidx.annotation.RequiresApi

@RequiresApi(Build.VERSION_CODES.O)
object AutofillDatasetBuilder {

    fun buildDataset(
        context: Context,
        usernameId: AutofillId?,
        passwordId: AutofillId?
    ): Dataset? {
        val presentation = RemoteViews(context.packageName, android.R.layout.simple_list_item_1).apply {
            setTextViewText(android.R.id.text1, "Arca — Fill Credentials")
        }

        val builder = Dataset.Builder(presentation)
        var hasField = false

        if (usernameId != null) {
            builder.setValue(usernameId, AutofillValue.forText(""))
            hasField = true
        }

        if (passwordId != null) {
            builder.setValue(passwordId, AutofillValue.forText(""))
            hasField = true
        }

        return if (hasField) builder.build() else null
    }
}

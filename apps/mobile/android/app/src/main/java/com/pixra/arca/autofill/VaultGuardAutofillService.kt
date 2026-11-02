package com.pixra.arca.autofill

import android.app.assist.AssistStructure
import android.os.Build
import android.os.CancellationSignal
import android.service.autofill.AutofillService
import android.service.autofill.FillCallback
import android.service.autofill.FillRequest
import android.service.autofill.FillResponse
import android.service.autofill.SaveCallback
import android.service.autofill.SaveRequest
import android.view.autofill.AutofillId
import androidx.annotation.RequiresApi

@RequiresApi(Build.VERSION_CODES.O)
class VaultGuardAutofillService : AutofillService() {

    override fun onFillRequest(
        request: FillRequest,
        cancellationSignal: CancellationSignal,
        callback: FillCallback
    ) {
        val structure = request.fillContexts.lastOrNull()?.structure ?: run {
            callback.onSuccess(null)
            return
        }

        val parsedFields = parseStructure(structure)
        if (parsedFields.usernameId == null && parsedFields.passwordId == null) {
            callback.onSuccess(null)
            return
        }

        val responseBuilder = FillResponse.Builder()
        val dataset = AutofillDatasetBuilder.buildDataset(
            this,
            parsedFields.usernameId,
            parsedFields.passwordId
        )

        if (dataset != null) {
            responseBuilder.addDataset(dataset)
            callback.onSuccess(responseBuilder.build())
        } else {
            callback.onSuccess(null)
        }
    }

    override fun onSaveRequest(request: SaveRequest, callback: SaveCallback) {
        callback.onSuccess()
    }

    private data class ParsedFields(
        var usernameId: AutofillId? = null,
        var passwordId: AutofillId? = null
    )

    private fun parseStructure(structure: AssistStructure): ParsedFields {
        val fields = ParsedFields()
        val nodeCount = structure.windowNodeCount
        for (i in 0 until nodeCount) {
            val windowNode = structure.getWindowNodeAt(i)
            traverseViewNode(windowNode.rootViewNode, fields)
        }
        return fields
    }

    private fun traverseViewNode(node: AssistStructure.ViewNode, fields: ParsedFields) {
        val hints = node.autofillHints
        if (hints != null) {
            for (hint in hints) {
                if (hint.equals("username", ignoreCase = true) ||
                    hint.equals("emailAddress", ignoreCase = true)
                ) {
                    fields.usernameId = node.autofillId
                } else if (hint.equals("password", ignoreCase = true)) {
                    fields.passwordId = node.autofillId
                }
            }
        }

        // Fallback to class and input type
        val inputType = node.inputType
        if (fields.passwordId == null && (inputType and 0x80) != 0) { // TYPE_TEXT_VARIATION_PASSWORD
            fields.passwordId = node.autofillId
        }

        for (i in 0 until node.childCount) {
            traverseViewNode(node.getChildAt(i), fields)
        }
    }
}

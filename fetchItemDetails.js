/**
* @NApiVersion 2.1
* @NScriptType UserEventScript
* @NModuleScope SameAccount
*/
define(['N/record', 'N/https', 'N/log','N/runtime'], function (record, https, log,runtime) {
 
    function afterSubmit(context) {
        try {
            // Only process on create or edit
            // if (context.type !== context.UserEventType.CREATE &&
            //     context.type !== context.UserEventType.EDIT) {
            //     return;
            // }
 
            let newRecord = context.newRecord;
            let remainingUsage = runtime.getCurrentScript().getRemainingUsage();
            log.debug('remainingUsage', remainingUsage);
            let userRole = runtime.getCurrentUser().name;
            log.debug('userRole', userRole);
 
            // Fetch key fields
            let itemId = newRecord.id;
            let itemType = newRecord.type;
            let itemName = newRecord.getValue({ fieldId: 'itemid' });
            let description = newRecord.getValue({ fieldId: 'salesdescription' });
            let basePrice = newRecord.getValue({ fieldId: 'baseprice' });
            let class_ = newRecord.getText({ fieldId: 'class' });
            let assemblyInstruction = newRecord.getValue({ fieldId: 'custitem_assembly_instructions' });
            let productCategory = newRecord.getText({ fieldId: 'custitem_ch_inv_prd_category' });
            let subProductCategory = newRecord.getText({ fieldId: 'custitem_ch_inv_pd_subcategory' });
 
 
            // Prepare payload
            let payload = {
 
                "title": description,
 
                "sku": itemName,
 
                "netsuite_user": userRole,
 
                "descriptionHtml": "<p>Danica Reclaimed Oak 4Dr Buffet Cafe Brow</p>",
 
                "metafields": [
 
                    {
 
                        "namespace": "custom",
 
                        "key": "class",
 
                        "type": "single_line_text_field",
 
                        "value": class_
 
                    },
 
                    {
 
                        "namespace": "custom",
 
                        "key": "requires_assembly",
 
                        "type": "single_line_text_field",
 
                        "value": assemblyInstruction
 
                    },
 
                    {
 
                        "namespace": "custom",
 
                        "key": "category",
 
                        "type": "single_line_text_field",
 
                        "value": productCategory
 
                    },
 
                    {
 
                        "namespace": "custom",
 
                        "key": "subcategory",
 
                        "type": "single_line_text_field",
 
                        "value": subProductCategory
 
                    }
                ]
 
            };
            log.debug('payload', payload);
 
            let response = https.post({
                url: 'https://ch-product-549109569495.asia-south1.run.app/netsuite-product-sync',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            log.debug('Response', response);

            log.debug('Response', JSON.parse(response.body));
 
            log.audit('POST Response', {
                code: response.code,
                body: response.body
            });
 
        } catch (e) {
            log.error({
                title: 'Error in afterSubmit',
                details: e
            });
        }
    }
 
    return {
        afterSubmit: afterSubmit
    };
 
});
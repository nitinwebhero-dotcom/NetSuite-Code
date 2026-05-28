/**
 * @NApiVersion 2.x
 * @NScriptType Suitelet
 */
define(['N/ui/serverWidget','N/runtime', 'N/record', 'N/render', 'N/search', 'N/http'],

function(serverWidget, runtime, record, render, search, http) {
	function onRequest(context) {
        var request			= context.request;
        var serverResponse	= context.response;
    	if (request.method === 'GET') {
			try {
				var userObj		= runtime.getCurrentUser();
				var scriptObj	= runtime.getCurrentScript();
				var invoiceId	= request.parameters.invId;
				var invRef_file	= request.parameters.invRef;
				var renderer	= render.create();
				renderer.setTemplateById(548);
				var invRecord	= record.load({ 
					type: record.Type.INVOICE, 
					id: Number(invoiceId)});
				log.debug("userObj.id",userObj.id);
				var empRecord	= record.load({ 
					type: record.Type.EMPLOYEE, 
					id: Number(userObj.id)});
				
				renderer.addRecord({templateName: 'record',
					record: invRecord});
				
				renderer.addRecord({templateName: 'employee',
					record: empRecord});
					
				var caseXML = renderer.renderAsPdf();
				//var todayDate = new Date();
				context.response.writeFile(caseXML, true);
			}
			catch(e) {
				context.response.writeFile(e, true);
			}
	    }    	    	
    }

    return {
        onRequest: onRequest
    };
    
})

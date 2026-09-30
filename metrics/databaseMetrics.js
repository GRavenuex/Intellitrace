const mongoose = require('mongoose');
const { recordDatabaseOperation } = require('./metrics');

const methodsToTrack = [
    'find', 'findOne', 'findById', 'findOneAndUpdate', 'findOneAndDelete', 'findOneAndReplace',
    'save', 'updateOne', 'updateMany', 'deleteOne', 'deleteMany',
    'aggregate', 'countDocuments', 'estimatedDocumentCount', 'insertMany'
];

const databaseMetricsPlugin = (schema) => {
    methodsToTrack.forEach((method) => {
        schema.pre(method, function () {
            this._startTime = Date.now();
        });

        // Using safe handling inside post hook to not swallow errors
        schema.post(method, function (res) {
            try {
                if (this._startTime) {
                    const duration = Date.now() - this._startTime;
                    const modelName = this.model ? this.model.modelName : (this.constructor ? this.constructor.modelName : "Unknown");
                    const operationName = `${modelName}.${method}`;
                    recordDatabaseOperation(operationName, duration, true);
                }
            } catch (err) {
                console.error("Error in database metrics post hook:", err);
            }
        });

        // Track errors
        schema.post(method, function (error, res, next) {
            try {
                if (this._startTime) {
                    const duration = Date.now() - this._startTime;
                    const modelName = this.model ? this.model.modelName : (this.constructor ? this.constructor.modelName : "Unknown");
                    const operationName = `${modelName}.${method}`;
                    recordDatabaseOperation(operationName, duration, false);
                }
            } catch (err) {
                console.error("Error in database metrics error hook:", err);
            }
            next(error); // Pass the original error
        });
    });
};

module.exports = databaseMetricsPlugin;

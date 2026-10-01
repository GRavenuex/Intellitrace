const errorHandler = (err, req, res, next) => {
    console.error('IntelliTrace Error:', err);
    res.status(err.status || 500).json({
        success: false,
        message: err.message || 'Internal Server Error'
    });
};

module.exports = errorHandler;

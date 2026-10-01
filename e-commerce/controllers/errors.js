exports.pagenotfound =(req, res , next)=>{
    res.status(404).render('404' , {pageTitle:'page not found..',
        isLoggedIn : req.isLoggedIn,
        user:req.session.user,
    });

};
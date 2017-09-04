var footer_string =
    `<footer id="footer">
  <div class="container">
    <div class="row">
      <div class="grid_12"> 
        <h2>Contact</h2>
        <a href="#" class="footer_mail">info@demolink.org</a>
        <!-- <div class="sub-copy">Website designed by <a href="http://www.templatemonster.com/" rel="nofollow">TemplateMonster.com</a></div> -->
      </div>
    </div>

  </div>  
</footer>`;

var footer = $.parseHTML(footer_string);
$("#footer_content").append(footer);
var header_string = 
`<header>
  <div class="header_top">
    <div class="container">
      <div class="row">
        <div class="grid_12">
          <h1><a href="/index">Ramblings of a <br>Not-Quite Photographer </a></h1>
          Isaac Garza
        </div>
      </div>
    </div>
  </div>
  <section id="stuck_container">
  <!--==============================
              Stuck menu
  =================================-->
    <div class="container">
      <div class="row">
        <div class="grid_12 ">
          <h1 class="logo">
            <a href="/index">
              Ramblings of a Not-Quite Photographer
            </a>
          </h1>
          <div class="navigation ">
            <nav>
              <ul class="sf-menu">
               <li><a href="/index">Home</a></li>
<!--           <li><a href="/about">About</a></li>-->
               <li><a href="/gallery">Gallery</a></li>
               <li><a href="/blog">Blog</a></li>
<!--               <li><a href="contacts">Contacts</a></li>-->
             </ul>
            </nav>
            <div class="clear"></div>
          </div>       
         <div class="clear"></div>  
        </div>
     </div> 
    </div> 
  </section>
</header>`;

var header = $.parseHTML(header_string);
$("#header_content").append(header);
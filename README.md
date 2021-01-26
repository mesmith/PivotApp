I'm very impressed with the 
<a href="http://d3js.org">D3 javascript framework</a>,
used to generate powerful, animated visualizations in the browser.
<p>
In addition, the 
<a href="http://facebook.github.io/react">ReactJS user interface
library</a> and
<a href="http://github.com/reactjs/redux">Redux state container</a>
make for a powerful Functional Programming environment.
<p>
Finally, the <a href="https://www.mongodb.com">mongodb</a> 
NoSQL database, and the NodeJS environment allow us to create
a high-performance mid-tier and back-end that is 100%
(CommonJS) javascript.

<div style="margin-top:100px; margin-left:30px"/>
<div id="strat" style="float:left; width:400px">

I used those tools to develop this app <a href="http://d3.7bsoftware.com:8080/index.html">(see it live!)</a>.  You can point this app to any dataset,
and it will semi-automatically provide categorical data pivoting and
filtering.  (You will have to modify the metadata object in 
js-react/metadata.js, but that is an easy thing to do.)
<p>
<h2>Installation</h2>
First, git clone the app.  Then:
<pre>
  $ cd ./PivotApp
  $ npm install
</pre>

Then you should make sure that MongoDB version 4 (or greater) is installed on your server, and
is listening at localhost:27017.  You can load up the repo's example datasets into 
your MongoDB database thus:
<pre>
  $ npm run loader
</pre>

Next, run the REST server:
<pre>
  $ npm run server
</pre>

In a separate window, run the client app:
<pre>
  $ npm run dev-client
</pre>

Then point your browser at 
  http://localhost:8080/webpack-dev-server/index.html
to view the data.

<p>
The app has the following interesting properties:
<ul>
<li><p>
<strong>
React/Redux are used to manage user events and generate
DOM changes.
</strong>
Pure functions are leveraged to great effect.
<li><p>
<strong>Input data is decoupled from presentation.</strong>  There aren't any data-specific
kludges in the javascript code.
<li><p>
<strong>
A metadata layer ensures that data is decoupled from input controls.
</strong>
Adding a metadata table and joining it to the actual input is a clean method of describing
whether particular data can be added to tooltips, used for pivots, or used for
aggregation.  This allows a single point of control for any dataset.
<li><p>
<strong>
Label placement is a pretty hard problem, solved here with a 
<a href="https://github.com/d3/d3-force">
force graph</a>.
</strong>
A crowded graph presents a tricky label positioning issue.  We use a force graph
to force label names apart.
<li><p>
<strong>
A
force graph 
is also being used to model a simple network.
</strong>
In the app, the network is a simple hierarchy built from inherent parent-child
relationships within the dataset.
<li><p>
<strong>
The app supports auto-rollup of status within the network visualization.
</strong>
Statuses are plotted as red (bad), yellow (warning), green (ok), and gray (unknown).  
A parent node can have its own innate status, but it also displays (on its ringed outer border)
the worst status of any of its descendents.
<li><p>
<strong>
Data transforms use the mongodb aggregation pipeline, a super-efficient
method for retrieving large datasets on the server.
</strong>
The aggregation pipeline handles filtering, pivoting, and aggregation.  The
work could have been done in the browser, but as the data scales, using
fast-performing server techniques are better.
</ul>

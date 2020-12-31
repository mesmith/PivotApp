const path = require('path');
const webpack = require('webpack');
const dotenv = require('dotenv');
const commitDate = require('child_process')
  .execSync('date')
  .toString();

const BUILD_DIR = path.resolve(__dirname, './views');
const DIST_DIR = path.resolve(__dirname, './dist');
const APP_DIR = path.resolve(__dirname, 'js-react');

// reduce env to envKeys object
const env = dotenv.config().parsed;
const envKeys = env? Object.keys(env).reduce((prev, next) => {
  prev[`process.env.${next}`] = JSON.stringify(env[next]);
  return prev;
}, {}) : {};

module.exports = {
  entry: APP_DIR + '/main.js',
  output: {
    path: BUILD_DIR,
    filename: 'bundle.js'
    // path: DIST_DIR,
    // filename: '[name].[hash].js'
  },
  devtool: 'source-map',
  mode: 'development',
  module: {  // auto-transpiler
    rules: [
      {
        test: /\.js$/,
        // exclude: /(node_modules|views)/,
        include: APP_DIR,
        loader: 'babel-loader',
        options: {
          babelrc: false,
          plugins: [
            "@babel/plugin-proposal-object-rest-spread",
            "react-hot-loader/babel"
          ],
          presets: ["@babel/preset-env", "@babel/preset-react"]
        }
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader']
      }
    ]
  },
  resolve: {
    extensions: ['*', '.js', '.jsx']
  },
  devServer: {
    hot: true,
    inline: true,
    overlay: true,  // add debugger
    disableHostCheck: true,

    publicPath: '/',
    contentBase: 'views',
    watchContentBase: true,

    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
      }
    },
  },
  plugins: [
     new webpack.NamedModulesPlugin(),
     new webpack.HotModuleReplacementPlugin({
       multiStep: true
     }),
     new webpack.DefinePlugin({
       __COMMIT_DATE__: JSON.stringify(commitDate)
     }),
     new webpack.DefinePlugin(envKeys)
  ],
}

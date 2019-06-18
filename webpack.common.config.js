const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const CopyWebpackPlugin = require('copy-webpack-plugin');
const path = require('path')
const webpack = require('webpack')

const potreeDir = 'lib/potree/build/potree'

module.exports = {
	resolve: {
		extensions: ['.js']
	},
	module: {
		rules: [{
				test: /\.js$/,
				exclude: /node_modules/,
				use: "babel-loader"
			},
			{
				test: /\.html$/,
				use: "html-loader"
			},
			{
				test: /\.css$/,
				use: [
					MiniCssExtractPlugin.loader,
					"css-loader"
				],
			},
			{
				test: /.(png|woff|woff2|eot|ttf|svg)(\?.*)?$/,
				use: {
					loader: "url-loader",
					options: {
						limit: 100000
					}
				}
			}
		]
	},
	optimization: {
		splitChunks: {
			chunks: 'all'
		}
	},
	plugins: [
		new webpack.ProvidePlugin({
			$: 'jquery',
			jQuery: 'jquery',
			'window.jQuery': 'jquery'
		}),
		new MiniCssExtractPlugin(),
		new CopyWebpackPlugin([{from: path.join(potreeDir, 'resources'), to: 'resources'}]),
		new CopyWebpackPlugin([{from: path.join(potreeDir, 'potree.js'), to: 'potree.js'}]),
		new CopyWebpackPlugin([{from: 'lib/potree/libs/three.js/build/three.min.js', to: 'three.min.js'}]),
		new CopyWebpackPlugin([{from: 'lib/potree/libs/proj4/proj4.js', to: 'proj4.js'}]),
		new CopyWebpackPlugin([{from: 'lib/potree/libs/tween/tween.min.js', to: 'tween.min.js'}]),
		new CopyWebpackPlugin([{from: 'lib/potree/libs/other/BinaryHeap.js', to: 'BinaryHeap.js'}]),
		new CopyWebpackPlugin([{from: path.join(potreeDir, 'workers'), to: 'workers'}]),
		new CopyWebpackPlugin([{from: 'src/workers/terrainparser.js', to: 'workers/terrainparser.js'}]),
		new CopyWebpackPlugin([{from: 'src/static', to: 'static'}]),
	]
}
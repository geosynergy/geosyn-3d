const webpack = require("webpack");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const commonConfig = require("./webpack.common.config");
const merge = (...objs) => require("deepmerge").all(objs, {arrayMerge: (arr1, arr2) => arr1.concat(arr2) });


const combinedConfigs = merge({}, commonConfig, {
	entry: [
		"./src/index.js",
	],
	output: {
		publicPath: "/",
		filename: "bundle.js",
		library: 'dev'
	},
	devtool: "#eval",
	plugins: [
		new webpack.HotModuleReplacementPlugin(),
		new HtmlWebpackPlugin({
			template: "./test-wwwroot/index.html"
		})
	],
	devServer: {
		inline: true,
		contentBase: "test-wwwroot",
		proxy: [{
			path: '/geosyn/',
			// target: 'https://www.kegsys.com/',
			target: 'https://g3d.kegsys.com/',
			secure: false,
			changeOrigin: true,
			pathRewrite: {'^/geosyn' : ''}
		}]
	},
	mode: "development"
});

module.exports = combinedConfigs;

export const useGlobalLoaderStore = defineStore('useGlobalLoaderStore', () => {
	const isGlobalLoading = ref(false)

	return { isGlobalLoading }
})
